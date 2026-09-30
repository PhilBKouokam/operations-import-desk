import test,{before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import { spawn, fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Redis } from 'ioredis';
import { ImportStore, detail } from '../../api/src/store.js';
import type { ImportDoc } from '../../api/src/store.js';
import { ProcessingState, ProcessingFailure, PROCESSING } from '../src/state.js';
import { Transport, dispatchScan, startConsumer } from '../src/transport.js';
import { calculate, processNotice } from '../src/processor.js';
import { exportCsv } from '../../api/src/results.js';
import { createApp } from '../../api/src/app.js';
import { login } from '../../api/test/oidc-helper.js';
const mongoBin=process.env.MONGOD_BIN,redisBin=process.env.REDIS_SERVER_BIN,issuer=process.env.M2_OIDC_ISSUER;
if(!mongoBin||!redisBin||!issuer)throw new Error('Real MongoDB, Redis executables and Keycloak issuer are required; no mock fallback');
const mongoUri='mongodb://127.0.0.1:27019',redisUrl='redis://127.0.0.1:6381';
const config={mongoUri,database:'odi_m3_integration',issuer,audience:'odi-api',roleClient:'odi-api',uiOrigin:'http://127.0.0.1:5173',port:0};
const owner={issuer:'fixture',subject:'operator',role:'operator' as const};
const header='shipment_id,origin_code,destination_code,scheduled_date,weight_kg,carrier_code\n';
let dir:string,mongo:ChildProcess,redis:ChildProcess,store:ImportStore,state:ProcessingState,transport:Transport,admin:Redis;
let consumer:ReturnType<typeof startConsumer>|undefined;
const silent=()=>{};
async function until<T>(f:()=>Promise<T|false|null|undefined>,ms=15000):Promise<T>{const end=Date.now()+ms;while(Date.now()<end){const v=await f();if(v)return v;await delay(100);}throw new Error('Condition timed out');}
async function stop(child:ChildProcess){if(child.exitCode!==null||child.signalCode!==null)return;const done=new Promise<void>(resolve=>child.once('exit',()=>resolve()));child.kill('SIGKILL');await done;}
function startMongo(){mongo=spawn(mongoBin!,['--dbpath',join(dir,'mongo'),'--bind_ip','127.0.0.1','--port','27019','--nounixsocket','--setParameter','enableTestCommands=1'],{stdio:'ignore'});}
function startRedis(){redis=spawn(redisBin!,['--bind','127.0.0.1','--port','6381','--save','','--appendonly','no'],{stdio:'ignore'});}
async function mongoReady(){await until(async()=>{try{await store.ping();return true;}catch{return false;}},20000);}
async function redisReady(){await until(async()=>{try{return (await admin.ping())==='PONG';}catch{return false;}});await until(async()=>transport.connection.status==='ready');}
async function fresh(rows='S1,AA,BB,2026-01-01,1.25,CC'){return (await store.create(owner,'input.csv',Buffer.from(header+rows+'\n'))).doc;}
const notice=(d:ImportDoc)=>({importId:d._id,run:d.run});
async function get(d:ImportDoc){return (await store.collection.findOne({_id:d._id}))!;}
async function expire(d:ImportDoc){await store.collection.updateOne({_id:d._id},{$set:{leaseExpiresAt:new Date(0)}});}
async function due(d:ImportDoc){await store.collection.updateOne({_id:d._id},{$set:{nextAttemptAt:new Date(0),nextDispatchAt:new Date(0)}});}
function startWorker(){consumer=startConsumer(state,redisUrl,silent);return consumer;}
async function finish(d:ImportDoc,ms=15000){let scanned=0;return until(async()=>{if(Date.now()-scanned>=PROCESSING.scanMs){scanned=Date.now();await state.recover();await dispatchScan(state,transport,silent);}const current=await get(d);return current.state.startsWith('COMPLETED')?current:false;},ms);}
before(async()=>{dir=await mkdtemp(join(tmpdir(),'odi-m3-'));await mkdir(join(dir,'mongo'));startMongo();startRedis();store=new ImportStore(config);await store.connect();state=new ProcessingState(store);transport=new Transport(redisUrl);admin=new Redis(redisUrl,{maxRetriesPerRequest:1,enableOfflineQueue:false});admin.on('error',silent);await redisReady();});
beforeEach(async()=>{await store.collection.deleteMany({});await admin.flushdb();});
afterEach(async()=>{if(consumer){await consumer.close();consumer=undefined;}});
after(async()=>{if(consumer)await consumer.close();await transport?.close();admin?.disconnect();await store?.close();if(redis)await stop(redis);if(mongo)await stop(mongo);});
test('A01–A03 real BullMQ validates happy, mixed, all-invalid; atomic rows/counts and header-only export',async()=>{
  startWorker();
  for(const [rows,valid,rejected] of [['S1,AA,BB,2026-01-01,1.25,CC',1,0],['S2,AA,BB,2026-01-01,1,CC\nBAD,AA,AA,no,-1,CC',1,1],['=SUM(A1),AA,AA,no,-1,CC',0,1]] as const){
    const d=await fresh(rows),end=await finish(d);assert.equal(end.result?.validCount,valid);assert.equal(end.result?.rejectedCount,rejected);assert.equal(end.state,rejected?'COMPLETED_WITH_ERRORS':'COMPLETED');assert.equal(end.attempt,1);assert.equal(end.leaseToken,null);assert.equal(end.result?.acceptedRows.length,valid);assert.equal(end.result?.rejectedRows.length,rejected);
    if(!valid){assert.equal(exportCsv(end,'accepted').split('\r\n').length,2);assert.match(exportCsv(end,'errors'),/"'=SUM\(A1\)"/);assert.equal(end.result!.rejectedRows[0]!.values.shipment_id,'=SUM(A1)');}
    const serialized=JSON.stringify(detail(end));for(const key of ['owner','inputBytes','leaseToken','nextDispatchAt','contentHash','acceptedRows'])assert.ok(!serialized.includes(`"${key}":`));
  }
});
test('A08 Redis unavailable before acceptance and after acceptance; bounded enqueue failure then real redispatch',async()=>{
  await stop(redis);const before=await fresh();const start=Date.now();await dispatchScan(state,transport,silent);assert.ok(Date.now()-start<2500);const pending=await get(before);assert.equal(pending.state,'PENDING');assert.equal(pending.attempt,0);assert.ok(pending.nextDispatchAt>pending.createdAt);
  startRedis();await redisReady();startWorker();await finish(before,40000);
  const after=await fresh('S2,AA,BB,2026-01-01,1,CC');await stop(redis);await dispatchScan(state,transport,silent);assert.equal((await get(after)).attempt,0);startRedis();await redisReady();await finish(after,40000);console.log('A08 recovered '+JSON.stringify({importIds:[before._id,after._id],states:[(await get(before)).state,(await get(after)).state],attempts:[(await get(before)).attempt,(await get(after)).attempt]}));
});
test('A20 dispatcher dies after reservation; Mongo reservation expires and work recovers',async()=>{
  const d=await fresh();const child=await childAt('reserve');await stop(child);assert.equal(await state.reserve(),null);assert.equal((await get(d)).attempt,0);
  // Actual child termination at the reservation/enqueue boundary; wait the real 30s reservation.
  startWorker();const start=Date.now();const end=await finish(d,40000);assert.ok(Date.now()-start>=28000);assert.equal(end.attempt,1);
});
test('A10 two workers race; expired old worker cannot publish or fail, even before recovery',async()=>{
  const d=await fresh(),claims=await Promise.all([state.claim(notice(d)),state.claim(notice(d))]);assert.equal(claims.filter(Boolean).length,1);const old=claims.find(Boolean)!;const result=await calculate(old);
  await expire(d);assert.equal(await state.publish(old,result),false);assert.equal(await state.fail(old,new ProcessingFailure('TRANSIENT_DEPENDENCY',true)),false);
  assert.equal(await state.recover(),1);await due(d);const current=(await state.claim(notice(d)))!;assert.notEqual(current.leaseToken,old.leaseToken);assert.equal(await state.publish(old,result),false);assert.equal(await state.publish(current,result),true);assert.equal(await state.publish(old,result),false);assert.equal((await get(d)).attempt,2);
});
async function childAt(mode:'claim'|'commit'|'reserve'){
  const child=fork(new URL('./child.js',import.meta.url),[],{env:{...process.env,M3_MONGO_URI:mongoUri,M3_REDIS_URL:redisUrl,CHILD_MODE:mode},stdio:['ignore','ignore','inherit','ipc']});
  const reached=new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Child boundary timeout')),15000);child.on('message',(m:unknown)=>{if(m&&typeof m==='object'&&'event'in m&&m.event===(mode==='commit'?'committed':mode==='reserve'?'reserved':'claimed')){clearTimeout(timeout);resolve();}});});
  if(mode!=='reserve')await dispatchScan(state,transport,silent);await reached;return child;
}
test('A09 actual SIGKILL after claim; production 60s lease recovers within 75s',async()=>{
  const d=await fresh(),child=await childAt('claim');await stop(child);assert.equal((await get(d)).state,'PROCESSING');const start=Date.now();startWorker();const end=await finish(d,75000);assert.equal(end.attempt,2);assert.ok(Date.now()-start<75000);assert.equal(end.result?.validCount,1);console.log('A09 recovered '+JSON.stringify({importId:d._id,state:end.state,attempt:end.attempt,elapsedMs:Date.now()-start}));
});
test('A11 SIGKILL after committed result before transport ack; stalled job redelivers without mutation',async()=>{
  const d=await fresh(),child=await childAt('commit');await stop(child);const snapshot=await get(d);assert.equal(snapshot.state,'COMPLETED');let ignored=0;consumer=startConsumer(state,redisUrl,e=>{if(e.event==='notification_ignored')ignored++;});await until(async()=>!(await transport.queue.getJob(`import-${d._id}-run-1`)),45000);assert.equal(ignored,1);await processNotice(state,notice(d),silent);assert.deepEqual(await get(d),snapshot);
});
test('A12 three transient attempts per run; concurrent manual retry creates exactly run 2; second exhaustion final',async()=>{
  const d=await fresh();
  for(const run of [1,2] as const){
    for(let attempt=1;attempt<=3;attempt++){
      const claimed=(await state.claim({importId:d._id,run}))!;assert.ok(claimed);assert.equal(claimed.attempt,attempt);await state.fail(claimed,new ProcessingFailure('TRANSIENT_DEPENDENCY',true));const current=await get(d);
      assert.equal(current.state,attempt===3?'FAILED':'PENDING');assert.equal(current.result,null);
      if(attempt<3){assert.equal(current.nextAttemptAt.getTime()-current.updatedAt.getTime(),attempt===1?2000:4000);assert.equal(await state.claim({importId:d._id,run}),null);await delay(attempt===1?2050:4050);}
    }
    if(run===1){const replies=await Promise.all([store.retry(owner,d._id),store.retry(owner,d._id)]);assert.equal(replies.filter(r=>!r.duplicate).length,1);assert.equal((await get(d)).run,2);assert.equal((await get(d)).attempt,0);}
  }
  const end=await get(d);assert.equal(end.run,2);assert.equal(end.attempt,3);assert.equal((await store.retry(owner,d._id)).duplicate,true);assert.deepEqual(await get(d),end);assert.equal(await state.claim(notice(end)),null);assert.ok(end.events.length<=32);
});
test('A13 FLUSHDB loses waiting and active transport data; Mongo intent and attempts survive',async()=>{
  const d=await fresh();await dispatchScan(state,transport,silent);assert.equal((await transport.queue.getJobCounts('waiting')).waiting,1);await admin.flushdb();startWorker();const end=await finish(d,40000);assert.equal(end.attempt,1);
  const active=await fresh('S2,AA,BB,2026-01-01,1,CC');await consumer!.close();consumer=undefined;const claimed=(await state.claim(notice(active)))!;await admin.flushdb();assert.equal((await get(active)).attempt,1);await expire(claimed);await state.recover();startWorker();assert.equal((await finish(active)).attempt,2);
});
test('A14 real Mongo death during publication leaves no partial result; restart and lease recovery succeeds',async()=>{
  const d=await fresh(),claimed=(await state.claim(notice(d)))!,result=await calculate(claimed);await stop(mongo);await assert.rejects(state.publish(claimed,result));startMongo();await mongoReady();const interrupted=await get(d);assert.equal(interrupted.state,'PROCESSING');assert.equal(interrupted.result,null);await expire(d);await state.recover();await due(d);startWorker();assert.equal((await finish(d)).result?.validCount,1);
});
test('Result document bound fails safely with no partial publication and no retry',async()=>{
  const d=await fresh(),claimed=(await state.claim(notice(d)))!,result=await calculate(claimed);result.acceptedRows[0]!.shipment_id='X'.repeat(PROCESSING.documentBytes);await assert.rejects(state.publish(claimed,result),(e:unknown)=>e instanceof ProcessingFailure&&e.code==='RESULT_TOO_LARGE'&&!e.retryable);await state.fail(claimed,new ProcessingFailure('RESULT_TOO_LARGE',false));const end=await get(d);assert.equal(end.state,'FAILED');assert.equal(end.result,null);await assert.rejects(store.retry(owner,d._id));
});
test('A15/A16 real Keycloak: owner-scoped exports/errors/retry; viewer denied retry; lost retry response safe',async()=>{
  const {app,store:apiStore}=await createApp(config);await app.listen(0,'127.0.0.1');const base=await app.getUrl();
  try{
    const a=await login(issuer!,'operator-a'),b=await login(issuer!,'operator-b'),v=await login(issuer!,'viewer');
    const me=await (await fetch(base+'/v1/me',{headers:{authorization:`Bearer ${a.access_token}`}})).json() as {subject:string};
    const identity={issuer:issuer!,subject:me.subject,role:'operator' as const};
    await stop(redis);
    const form=new FormData();form.append('file',new Blob([header+'HTTP1,AA,BB,2026-01-01,1,CC'],{type:'text/csv'}),'pending.csv');
    const accepted=await fetch(base+'/v1/imports',{method:'POST',headers:{authorization:`Bearer ${a.access_token}`},body:form});assert.equal(accepted.status,202);
    const acceptedBody=await accepted.json() as {import:{id:string}};const durable=(await store.collection.findOne({_id:acceptedBody.import.id}))!;assert.equal(durable.state,'PENDING');assert.equal(durable.attempt,0);
    startRedis();await redisReady();startWorker();assert.equal((await finish(durable)).state,'COMPLETED');
const d=(await apiStore.create(identity,'safe.csv',Buffer.from(header+'=1,AA,BB,no,1,CC'))).doc;await processNotice(state,notice(d),silent);
    for(const suffix of ['errors','download?kind=errors','retry']){const opts=suffix==='retry'?{method:'POST',body:JSON.stringify({expectedRun:1}),headers:{authorization:`Bearer ${b.access_token}`,'content-type':'application/json'}}:{headers:{authorization:`Bearer ${b.access_token}`}};assert.equal((await fetch(`${base}/v1/imports/${d._id}/${suffix}`,opts)).status,404);}
    for(const suffix of ['errors','download?kind=errors','retry'])assert.equal((await fetch(`${base}/v1/imports/${d._id}/${suffix}`,suffix==='retry'?{method:'POST'}:{})).status,401);
    const viewerMe=await(await fetch(base+'/v1/me',{headers:{authorization:`Bearer ${v.access_token}`}})).json() as {subject:string};
    const viewerDoc=(await apiStore.create({issuer:issuer!,subject:viewerMe.subject,role:'viewer'},'viewer.csv',Buffer.from(header+'VIEW1,AA,BB,2026-01-01,1,CC'))).doc;await processNotice(state,notice(viewerDoc),silent);
    assert.equal((await fetch(`${base}/v1/imports/${viewerDoc._id}/download?kind=accepted`,{headers:{authorization:`Bearer ${v.access_token}`}})).status,200);
    const auth={authorization:`Bearer ${a.access_token}`};const csv=await fetch(`${base}/v1/imports/${d._id}/download?kind=errors`,{headers:auth});assert.equal(csv.status,200);assert.match(await csv.text(),/"'=1"/);assert.match(csv.headers.get('content-disposition')!,/^attachment;/);assert.equal(csv.headers.get('cache-control'),'no-store');
    assert.equal((await fetch(`${base}/v1/imports/${d._id}/errors?limit=101`,{headers:auth})).status,400);
    assert.equal((await fetch(`${base}/v1/imports/${d._id}/retry`,{method:'POST',headers:{authorization:`Bearer ${v.access_token}`,'content-type':'application/json'},body:'{"expectedRun":1}'})).status,403);
    const failed=(await apiStore.create(identity,'retry.csv',Buffer.from(header+'R1,AA,BB,2026-01-01,1,CC'))).doc;
    for(let i=0;i<3;i++){await due(failed);const c=(await state.claim(notice(failed)))!;await state.fail(c,new ProcessingFailure('TRANSIENT_DEPENDENCY',true));}
    const retry=()=>fetch(`${base}/v1/imports/${failed._id}/retry`,{method:'POST',headers:{...auth,'content-type':'application/json'},body:'{"expectedRun":1}'});
    assert.equal((await retry()).status,202);const again=await retry();assert.equal(again.status,200);assert.equal((await again.json() as {run:number}).run,2);
    assert.equal((await fetch(`${base}/v1/imports/${failed._id}/retry`,{method:'POST',headers:{...auth,'content-type':'application/json'},body:'{"expectedRun":1,"extra":true}'})).status,400);
  }finally{await app.close();await apiStore.close();}
});
test('A14 uncertain write acknowledgement: real Mongo write-concern failure after commit remains atomic',async()=>{
  const d=await fresh(),claimed=(await state.claim(notice(d)))!,result=await calculate(claimed);
  await store.client.db('admin').command({configureFailPoint:'failCommand',mode:{times:1},data:{failCommands:['update'],writeConcernError:{code:64,errmsg:'test-only uncertain acknowledgement'}}});
  await assert.rejects(state.publish(claimed,result));
  const end=await get(d);assert.equal(end.state,'COMPLETED');assert.deepEqual(end.result,result);
  assert.equal(await state.fail(claimed,new ProcessingFailure('TRANSIENT_DEPENDENCY',true)),false);
  await processNotice(state,notice(d),silent);assert.deepEqual(await get(d),end);
});
test('A20 early and old-run notifications are no-ops; transport completion and failure auto-remove',async()=>{
  const d=await fresh();await store.collection.updateOne({_id:d._id},[{$set:{nextAttemptAt:{$add:['$$NOW',30000]}}}]);
  startWorker();await transport.enqueue(notice(d));await until(async()=>(await transport.queue.getJobCounts('waiting','active','completed')).waiting===0&&(await transport.queue.getJobCounts('active')).active===0);
  assert.equal((await get(d)).attempt,0);assert.equal(await transport.queue.getJob(`import-${d._id}-run-1`),undefined);
  await due(d);assert.equal((await finish(d)).attempt,1);
  const d2=await fresh('R2,AA,BB,2026-01-01,1,CC');
  for(let i=0;i<3;i++){await due(d2);const c=(await state.claim(notice(d2)))!;await state.fail(c,new ProcessingFailure('TRANSIENT_DEPENDENCY',true));}
  const run2=(await store.retry(owner,d2._id)).doc;await processNotice(state,notice(d2),silent);assert.equal((await get(run2)).attempt,0);assert.equal((await finish(run2)).run,2);
  await consumer!.close();consumer=undefined;
  // A failed Mongo claim rejects the BullMQ processor; transport failure must not strand the durable intent.
  const failure=await fresh('R3,AA,BB,2026-01-01,1,CC');await dispatchScan(state,transport,silent);await stop(mongo);startWorker();
  await until(async()=>!(await transport.queue.getJob(`import-${failure._id}-run-1`)),12000);
  startMongo();await mongoReady();assert.equal((await get(failure)).attempt,0);await due(failure);assert.equal((await finish(failure)).attempt,1);
});
test('A20 ten minutes without consumers: stable ID bounds queue to one job; attempts zero; later completion',async()=>{
  const d=await fresh(),start=Date.now();let scans=0,reservations=0;const log=(e:{event:string})=>{if(e.event==='dispatched')reservations++;};
  while(Date.now()-start<600000){await Promise.all([dispatchScan(state,transport,log),dispatchScan(state,transport,log)]);const counts=await transport.queue.getJobCounts('waiting','active','delayed','failed','completed');assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),1);const current=await get(d);assert.equal(current.state,'PENDING');assert.equal(current.attempt,0);scans++;if(scans%12===0)console.log(`A20 observation elapsed_ms=${Date.now()-start} scans=${scans} reservations=${reservations} jobs=1 attempts=0`);await delay(5000);}
  assert.ok(reservations<=21);assert.ok(reservations>=19);console.log(`A20 final elapsed_ms=${Date.now()-start} scans=${scans} reservations=${reservations}`);startWorker();assert.equal((await finish(d)).attempt,1);
});
