import assert from 'node:assert/strict';
import { before, beforeEach, afterEach, test } from 'node:test';
import { createHash } from 'node:crypto';
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { SignJWT } from 'jose';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { TokenVerifier } from '../src/auth.js';
import { ApiError } from '../src/errors.js';
import { REQUIRED_INDEXES } from '../src/store.js';
import { login } from './oidc-helper.js';
import type { Tokens } from './oidc-helper.js';
// Explicit preconditions: this suite fails (never silently skips) without real services.
const uri=process.env.M2_MONGO_URI,issuer=process.env.M2_OIDC_ISSUER;
if(!uri||!issuer)throw new Error('Set M2_MONGO_URI and M2_OIDC_ISSUER to real MongoDB/Keycloak services.');
const config=loadConfig({MONGO_URI:uri,MONGO_DATABASE:'odi_m2_integration',OIDC_ISSUER:issuer,OIDC_AUDIENCE:'odi-api',OIDC_ROLE_CLIENT:'odi-api',UI_ORIGIN:'http://127.0.0.1:5173',PORT:'0'});
let a:Tokens,b:Tokens,v:Tokens,n:Tokens,wrongAudience:Tokens,short:Tokens;
let current:Awaited<ReturnType<typeof createApp>>,base:string;
const bytes=readFileSync('samples/valid.csv');
before(async()=>{a=await login(issuer,'operator-a');b=await login(issuer,'operator-b');v=await login(issuer,'viewer');n=await login(issuer,'no-role');wrongAudience=await login(issuer,'operator-a','odi-wrong-audience');short=await login(issuer,'operator-a','odi-short');assert.ok(short.expires_in<=2,'short token fixture must actually expire within two seconds');const wrongClaims=JSON.parse(Buffer.from(wrongAudience.access_token.split('.')[1]!,'base64url').toString()) as {aud?:string|string[]};assert.ok(![wrongClaims.aud].flat().includes('odi-api'),'wrong-audience fixture must omit API audience');});
beforeEach(async()=>{current=await createApp(config);await current.store.collection.deleteMany({});await current.app.listen(0,'127.0.0.1');base=await current.app.getUrl();});
afterEach(async()=>{if(current){await current.app.close();await current.store.close();}});
function form(data:Uint8Array=bytes,name='shipments.csv'):FormData{const f=new FormData();f.append('file',new Blob([new Uint8Array(data)],{type:'text/csv'}),name);return f;}
async function upload(token=a.access_token,data:Uint8Array=bytes,name='shipments.csv'){return fetch(`${base}/v1/imports`,{method:'POST',headers:{authorization:`Bearer ${token}`},body:form(data,name)});}
async function get(path:string,token=a.access_token){return fetch(base+path,{headers:{authorization:`Bearer ${token}`}});}
function safe(json:unknown):void{const text=JSON.stringify(json);for(const field of ['inputBytes','leaseToken','owner','issuer','contentHash','nextDispatchAt','resource_access','stack'])assert.ok(!text.includes(`"${field}":`),field);assert.ok(!text.includes(a.access_token));assert.ok(!text.includes('SHP001'));}

test('A06 integration: concurrent identical requests create one durable import and required indexes',async()=>{
  const responses=await Promise.all(Array.from({length:8},()=>upload()));
  assert.equal(responses.filter(r=>r.status===202).length,1);assert.equal(responses.filter(r=>r.status===200).length,7);
  const bodies=await Promise.all(responses.map(r=>r.json()));assert.equal(new Set(bodies.map(x=>x.import.id)).size,1);bodies.forEach(safe);
  assert.equal(await current.store.collection.countDocuments(),1);
  const doc=await current.store.collection.findOne({});assert.ok(doc);assert.equal(doc.contentHash,createHash('sha256').update(bytes).digest('hex'));assert.equal(doc.attempt,0);assert.equal(doc.state,'PENDING');assert.deepEqual(Buffer.from(doc.inputBytes.value()),bytes);assert.equal(+doc.nextDispatchAt,+doc.createdAt);
  const indexes=await current.store.collection.listIndexes().toArray();for(const expected of REQUIRED_INDEXES)assert.ok(indexes.some(i=>i.name===expected.name));
  const renamed=await upload(a.access_token,bytes,'renamed.csv');assert.equal(renamed.status,200);assert.equal((await renamed.json()).import.id,doc._id);
  const changed=await upload(a.access_token,Buffer.from(bytes.toString().replace('SHP001','SHP999')));assert.equal(changed.status,202);
});
test('A06/A15 integration: same bytes owned independently; list/detail expose no foreign imports',async()=>{
  const one=await (await upload()).json(),two=await (await upload(b.access_token)).json();assert.notEqual(one.import.id,two.import.id);
  assert.equal(await current.store.collection.countDocuments(),2);
  const list=await (await get('/v1/imports')).json();assert.deepEqual(list.items.map((x:{id:string})=>x.id),[one.import.id]);safe(list);
  const foreign=await get(`/v1/imports/${one.import.id}`,b.access_token);assert.equal(foreign.status,404);const missing=await get('/v1/imports/00000000-0000-4000-8000-000000000000',b.access_token);assert.equal(missing.status,404);
  const f=await foreign.json(),m=await missing.json();assert.equal(f.error.code,m.error.code);assert.equal(f.error.message,m.error.message);safe(f);
  const d=await(await get(`/v1/imports/${one.import.id}`)).json();safe(d);assert.equal(d.state,'PENDING');
});
test('A07 integration: proxy discards committed HTTP response; identical resubmission recovers same ID',async()=>{
  let committedId:string|undefined;
  const proxy=createServer((req,res)=>{
    const upstream=request(base+req.url!,{method:req.method,headers:req.headers},up=>{
      const chunks:Buffer[]=[];up.on('data',(c:Buffer)=>chunks.push(c));up.on('end',()=>{committedId=(JSON.parse(Buffer.concat(chunks).toString()) as {import?:{id:string}}).import?.id;res.destroy();});
    });upstream.on('error',()=>res.destroy());req.pipe(upstream);
  });
  await new Promise<void>(resolve=>proxy.listen(0,'127.0.0.1',resolve));
  try{await assert.rejects(()=>fetch(`http://127.0.0.1:${(proxy.address() as AddressInfo).port}/v1/imports`,{method:'POST',headers:{authorization:`Bearer ${a.access_token}`},body:form()}));
    assert.ok(committedId);const retry=await upload();assert.equal(retry.status,200);assert.equal((await retry.json()).import.id,committedId);assert.equal(await current.store.collection.countDocuments(),1);
  }finally{await new Promise<void>((resolve,reject)=>proxy.close(e=>e?reject(e):resolve()));}
});
test('A15 integration: real code/PKCE tokens map operator/viewer; no-role and viewer writes denied',async()=>{
  const op=await(await get('/v1/me')).json(),viewer=await(await get('/v1/me',v.access_token)).json();assert.equal(op.role,'operator');assert.equal(viewer.role,'viewer');assert.deepEqual(Object.keys(op).sort(),['role','subject']);
  assert.equal((await upload(v.access_token)).status,403);assert.equal((await get('/v1/me',n.access_token)).status,403);assert.equal(await current.store.collection.countDocuments(),0);
  // Owner-scoped viewer fixture seeded through the repository, not a forbidden HTTP upload.
  const stored=await current.store.create({issuer:config.issuer,subject:viewer.subject,role:'viewer'},'viewer.csv',bytes);
  assert.equal((await get(`/v1/imports/${stored.doc._id}`,v.access_token)).status,200);assert.equal((await get(`/v1/imports/${stored.doc._id}`)).status,404);
  assert.equal((await(await get('/v1/imports',v.access_token)).json()).items.length,1);
});
test('A15 integration: absent, malformed, tampered, wrong audience, ID and wrong-algorithm tokens rejected',async()=>{
  assert.equal((await fetch(base+'/v1/me')).status,401);
  const chunks=a.access_token.split('.');chunks[2]=(chunks[2]![0]==='A'?'B':'A')+chunks[2]!.slice(1);
  const hs=await new SignJWT({typ:'Bearer'}).setProtectedHeader({alg:'HS256'}).setIssuer(config.issuer).setSubject('x').setAudience('odi-api').setIssuedAt().setExpirationTime('5m').sign(new Uint8Array(32));
  for(const token of ['garbage',chunks.join('.'),wrongAudience.access_token,a.id_token,hs]){const res=await get('/v1/me',token);assert.equal(res.status,401);safe(await res.json());assert.equal(res.headers.get('www-authenticate'),'Bearer');}
});
test('A15 integration: wrong issuer rejected using real Keycloak discovery/JWKS under alternate host',async()=>{
  const alternate={...config,issuer:config.issuer.replace('127.0.0.1','localhost')};assert.notEqual(alternate.issuer,config.issuer);
  const verifier=await TokenVerifier.create(alternate);
  await assert.rejects(()=>verifier.verify(`Bearer ${a.access_token}`),(e:unknown)=>e instanceof ApiError&&e.status===401);
});
test('A15 integration: real short-lived Keycloak access token rejected after expiry plus tolerance',async()=>{
  const exp=(JSON.parse(Buffer.from(short.access_token.split('.')[1]!,'base64url').toString()) as {exp:number}).exp;
  const remaining=Math.max(0,(exp+31)*1000-Date.now());await new Promise(resolve=>setTimeout(resolve,remaining));assert.equal((await get('/v1/me',short.access_token)).status,401);
});
test('M2 integration: pagination stable, bounded and owner-scoped; invalid queries use safe envelopes',async()=>{
  for(let i=0;i<3;i++)assert.equal((await upload(a.access_token,Buffer.from(bytes.toString().replace('SHP001',`SHP00${i+4}`)))).status,202);
  const first=await(await get('/v1/imports?limit=2')).json();assert.equal(first.items.length,2);assert.ok(first.nextCursor);
  const second=await(await get('/v1/imports?limit=2&cursor='+first.nextCursor)).json();assert.equal(second.items.length,1);assert.equal(second.nextCursor,null);assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,3);
  for(const query of ['limit=51','limit[$gt]=1','cursor=bad','owner=other']){const res=await get('/v1/imports?'+query);assert.equal(res.status,400);safe(await res.json());}
});
for(const [name,body,status] of [
  ['empty multipart',()=>new FormData(),400],
  ['unknown field',()=>{const f=form();f.append('owner','other');return f;},400],
  ['wrong file field',()=>{const f=new FormData();f.append('other',new Blob([bytes],{type:'text/csv'}),'a.csv');return f;},400],
  ['two files',()=>{const f=form();f.append('file',new Blob([bytes],{type:'text/csv'}),'b.csv');return f;},400],
  ['oversized file',()=>form(new Uint8Array(262145)),413],
  ['malformed UTF-8',()=>form(new Uint8Array([0x80])),422],
  ['wrong CSV header',()=>form(Buffer.from('bad,header\n1,2')),422],
  ['bad CSV quotes',()=>form(Buffer.from(bytes.toString()+'"unclosed')),422],
  ['unsupported extension',()=>form(bytes,'bad.exe'),415],
] as const)test(`A04/A16 HTTP integration: ${name} rejected before persistence`,async()=>{
  const res=await fetch(base+'/v1/imports',{method:'POST',headers:{authorization:`Bearer ${a.access_token}`},body:body()});assert.equal(res.status,status);safe(await res.json());assert.equal(await current.store.collection.countDocuments(),0);
});
test('A04/A16 HTTP integration: exact file limit accepted; oversized envelope and malformed multipart rejected',async()=>{
  const header=bytes.toString().split('\n')[0]!;const rows=Array.from({length:400},()=>Array<string>(6).fill('A'));
  let remaining=262144-Buffer.byteLength([header,...rows.map(r=>r.join(','))].join('\n'));
  for(const r of rows)for(let i=0;i<6;i++){const extra=Math.min(remaining,127);r[i]+='A'.repeat(extra);remaining-=extra;}
  const exact=Buffer.from([header,...rows.map(r=>r.join(','))].join('\n'));assert.equal(exact.length,262144);assert.equal((await upload(a.access_token,exact)).status,202);
  for(const [type,body,expected]of [['multipart/form-data; boundary=x','--x\r\nmalformed',400],['multipart/form-data','body',400],['application/json','{}',415],['multipart/form-data; boundary=x','x'.repeat(300000),413]] as const){
    const r=await fetch(base+'/v1/imports',{method:'POST',headers:{authorization:`Bearer ${a.access_token}`,'content-type':type},body});assert.equal(r.status,expected);safe(await r.json());
  }assert.equal(await current.store.collection.countDocuments(),1);
});
test('A16 HTTP integration: chunked envelope cap applies without Content-Length',async()=>{
  const status=await new Promise<number>((resolve,reject)=>{
    const req=request(base+'/v1/imports',{method:'POST',headers:{authorization:`Bearer ${a.access_token}`,'content-type':'multipart/form-data; boundary=x','transfer-encoding':'chunked'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode!));});req.on('error',reject);
    // Oversized preamble exercises total envelope cap without buffering a file.
    for(let i=0;i<80;i++)req.write(Buffer.alloc(4096,65));req.end();
  });assert.equal(status,413);assert.equal(await current.store.collection.countDocuments(),0);
});
test('M2 integration: 10 uploads/IP/minute; safe errors; processing endpoints reject unavailable results',async()=>{
  for(let i=0;i<10;i++)assert.ok([200,202].includes((await upload()).status));
  const res=await upload(b.access_token);assert.equal(res.status,429);safe(await res.json());assert.equal(await current.store.collection.countDocuments(),1);
  const id=(await current.store.collection.findOne({}))!._id;
  for(const path of [`/v1/imports/${id}/errors`,`/v1/imports/${id}/download?kind=accepted`])assert.equal((await get(path)).status,409);
  assert.equal((await fetch(base+`/v1/imports/${id}/retry`,{method:'POST',headers:{authorization:`Bearer ${a.access_token}`,'content-type':'application/json'},body:'{"expectedRun":1}'})).status,409);
});

test('M2 integration: API restart preserves import and duplicate identity',async()=>{
  const initial=await(await upload()).json();await current.app.close();await current.store.close();
  current=await createApp(config);await current.app.listen(0,'127.0.0.1');base=await current.app.getUrl();
  const res=await upload();assert.equal(res.status,200);assert.equal((await res.json()).import.id,initial.import.id);assert.equal(await current.store.collection.countDocuments(),1);
});
test('M2 integration: incompatible unique index fails startup rather than accepting uploads',async()=>{
  await current.store.collection.dropIndex('owner_content_unique');
  await current.store.collection.createIndex(REQUIRED_INDEXES[0].key,{name:'owner_content_unique',unique:false});
  try{await assert.rejects(()=>createApp(config));}finally{await current.store.collection.dropIndex('owner_content_unique');await current.store.collection.createIndex(REQUIRED_INDEXES[0].key,{name:'owner_content_unique',unique:true});}
});
test('M2 integration: unavailable database connection returns safe 503 rather than success',async()=>{
  await current.store.close();const res=await upload();assert.equal(res.status,503);const body=await res.json();assert.equal(body.error.code,'DATABASE_UNAVAILABLE');safe(body);assert.deepEqual(Object.keys(body.error).sort(),['code','message','requestId']);
  assert.equal((await fetch(base+'/health/ready')).status,503);
});
