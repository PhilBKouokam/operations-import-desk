import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fork,spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {BSON} from 'mongodb';
import {ImportStore} from '../dist/apps/api/src/store.js';
import {ProcessingState} from '../dist/apps/worker/src/state.js';
import {Transport,dispatchScan} from '../dist/apps/worker/src/transport.js';
import {parseShipmentCsv} from '../dist/packages/input/src/index.js';
import {exportCsv} from '../dist/apps/api/src/results.js';
for(const k of ['MONGOD_BIN','REDIS_SERVER_BIN'])assert.ok(process.env[k],`Set ${k}`);
const runDir=fs.mkdtempSync('/tmp/odi-measure-');fs.mkdirSync(path.join(runDir,'mongo'));
const services=[],children=[];let store,transport;
const start=(bin,args,name)=>{const fd=fs.openSync(path.join(runDir,`${name}.txt`),'w');const p=spawn(bin,args,{stdio:['ignore',fd,fd]});fs.closeSync(fd);services.push(p);return p;};
const mongoUri='mongodb://127.0.0.1:27021',redisUrl='redis://127.0.0.1:6382',database='odi_m5_measure';
const environment={observedAt:new Date().toISOString(),node:process.version,platform:os.platform(),arch:os.arch(),kernel:os.release(),cpuModel:os.cpus()[0].model,logicalCpus:os.cpus().length,hostReportedMemoryBytes:os.totalmem(),cgroupCpu:fs.existsSync('/sys/fs/cgroup/cpu.max')?fs.readFileSync('/sys/fs/cgroup/cpu.max','utf8').trim():null,cgroupMemory:fs.existsSync('/sys/fs/cgroup/memory.max')?fs.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim():null,mongo:execFileSync(process.env.MONGOD_BIN,['--version'],{encoding:'utf8'}).split('\n')[0],redis:execFileSync(process.env.REDIS_SERVER_BIN,['--version'],{encoding:'utf8'}).trim(),bullmq:JSON.parse(fs.readFileSync('node_modules/bullmq/package.json')).version};
try{
 start(process.env.MONGOD_BIN,['--dbpath',path.join(runDir,'mongo'),'--bind_ip','127.0.0.1','--port','27021','--nounixsocket'],'mongo');
 start(process.env.REDIS_SERVER_BIN,['--bind','127.0.0.1','--port','6382','--save','','--appendonly','no'],'redis');
 store=new ImportStore({mongoUri,database});await store.connect();transport=new Transport(redisUrl);if(transport.connection.status!=='ready')await once(transport.connection,'ready');
 const state=new ProcessingState(store),owner={issuer:'http://measurement.invalid',subject:'synthetic',role:'operator'};
 async function experiment(label,rows,workerCount,imports){
  const workers=[];for(let i=0;i<workerCount;i++){const p=fork('scripts/measurement-worker.mjs',[],{env:{...process.env,MEASURE_MONGO_URI:mongoUri,MEASURE_REDIS_URL:redisUrl,MEASURE_DATABASE:database},stdio:['ignore','ignore','inherit','ipc']});children.push(p);await once(p,'message');workers.push(p);}
  const docs=[];const start=performance.now();
  for(let i=0;i<imports;i++){
   const prefix=`${label.toUpperCase()}-${i}`;
   const csv='shipment_id,origin_code,destination_code,scheduled_date,weight_kg,carrier_code\n'+Array.from({length:rows},(_,n)=>`${prefix}-${n},HOU,AUS,2026-10-01,125.500,DEMO`).join('\n')+'\n';
   const bytes=Buffer.from(csv);parseShipmentCsv(bytes);docs.push((await store.create(owner,`${label}-${i}.csv`,bytes)).doc);
  }
  const dispatchStarted=performance.now();await dispatchScan(state,transport,()=>{});
  let finished=[];const deadline=Date.now()+30000;
  while(Date.now()<deadline){finished=await store.collection.find({_id:{$in:docs.map(d=>d._id)}}).toArray();if(finished.every(d=>d.state==='COMPLETED'))break;await delay(5);}
  const done=performance.now();assert.equal(finished.length,imports);for(const d of finished){assert.equal(d.state,'COMPLETED');assert.equal(d.attempt,1);assert.equal(d.result.validCount,rows);}
  const memory=[];for(const p of workers){const reply=once(p,'message');p.send('stop');memory.push((await reply)[0].peakRssBytes);await once(p,'exit');}
  return{label,rowsPerImport:rows,imports,workerProcesses:workerCount,batchCreateThroughObservedCompletionMs:+(done-start).toFixed(2),dispatchThroughObservedCompletionMs:+(done-dispatchStarted).toFixed(2),workerPeakSampledRssBytes:memory,results:finished.map(d=>({importId:d._id,inputBytes:d.byteSize,claimToPublicationMs:d.finishedAt-d.startedAt,acceptanceToPublicationMs:d.finishedAt-d.createdAt,resultBsonBytes:BSON.calculateObjectSize(d.result),documentBsonBytes:BSON.calculateObjectSize(d),acceptedCsvBytes:Buffer.byteLength(exportCsv(d,'accepted')),errorCsvBytes:Buffer.byteLength(exportCsv(d,'errors'))}))};
 }
 const observations=[];
 observations.push(await experiment('single100',100,1,1));observations.push(await experiment('single1000',1000,1,1));
 observations.push(await experiment('batchone',1000,1,8));observations.push(await experiment('batchtwo',1000,2,8));
 const report={environment,method:'Real MongoDB/Redis/BullMQ and separate consumer processes; all-valid synthetic files. Uses production parser, store, dispatchScan, claim and publication. One immediate dispatch scan (excludes five-second scheduler wait), no HTTP/OIDC/UI timing. Consumers started before timed batch. RSS sampled every 10ms per process including idle baseline; not precise peak allocation and excludes Mongo/Redis. Single run per scenario, sequential scenario order, shared host/no statistical capacity claim. Batch creates eight durable imports before dispatch. Assertion: every result COMPLETED, correct count, attempt 1.',observations};
 const target=process.env.MEASURE_OUTPUT??'docs/test-output/m5-measurements.json';fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');console.log(`A19 observations saved: ${target}`);
}finally{
 for(const p of children)if(p.exitCode===null)p.kill();
 if(transport)await transport.close();if(store)await store.close();
 for(const p of services){p.kill();await once(p,'exit').catch(()=>{});}console.log(`Disposable service logs: ${runDir}`);
}
