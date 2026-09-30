// Test-only child process. No fault injection is exported through the HTTP application.
import { ImportStore } from '../../api/src/store.js';
import { ProcessingState } from '../src/state.js';
import { calculate } from '../src/processor.js';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUE_NAME } from '../src/transport.js';
import type { Notice } from '../src/state.js';
const store=new ImportStore({mongoUri:process.env.M3_MONGO_URI!,database:'odi_m3_integration',issuer:'test',audience:'test',roleClient:'test',uiOrigin:'http://127.0.0.1',port:0});await store.connect();
const state=new ProcessingState(store);
if(process.env.CHILD_MODE==='reserve'){await state.reserve();process.send?.({event:'reserved'});await new Promise(()=>{});}
const connection=new Redis(process.env.M3_REDIS_URL!,{maxRetriesPerRequest:null});
new Worker<Notice>(QUEUE_NAME,async job=>{
  const doc=await state.claim(job.data);if(!doc)return;
  process.send?.({event:'claimed'});
  if(process.env.CHILD_MODE==='commit'){
    await state.publish(doc,await calculate(doc));process.send?.({event:'committed'});
  }
  // Parent SIGKILLs this process before processor return / BullMQ acknowledgement.
  await new Promise(()=>{});
},{connection,lockDuration:2000,stalledInterval:1000});
