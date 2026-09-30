import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { validId } from '../../api/src/store.js';
import { notificationId, PROCESSING } from './state.js';
import type { Notice, ProcessingState } from './state.js';
import { processNotice, structuredLog } from './processor.js';
import type { Logger } from './processor.js';
export const QUEUE_NAME='shipment-imports-v1';
export function producerConnection(url:string){
  const connection=new Redis(url,{enableOfflineQueue:false,maxRetriesPerRequest:1,connectTimeout:2000,commandTimeout:2000});
  connection.on('error',()=>{});return connection;
}
export class Transport {
  readonly connection:Redis;readonly queue:Queue<Notice>;
  constructor(url:string){this.connection=producerConnection(url);this.queue=new Queue<Notice>(QUEUE_NAME,{connection:this.connection,defaultJobOptions:{attempts:1,removeOnComplete:true,removeOnFail:true}});this.queue.on('error',()=>{});}
  async enqueue(notice:Notice):Promise<void>{
    // Refuse disconnected writes; BullMQ readiness cannot leave an enqueue waiting indefinitely.
    if(this.connection.status!=='ready')throw new Error('TRANSPORT_UNAVAILABLE');
    let timer:NodeJS.Timeout|undefined;
    try{await Promise.race([this.queue.add('validate',notice,{jobId:notificationId(notice)}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('TRANSPORT_TIMEOUT')),2000);})]);}
    finally{if(timer)clearTimeout(timer);}
  }
  async close(){await this.queue.close();this.connection.disconnect();}
}
export async function dispatchScan(state:ProcessingState,transport:Transport,log:Logger=structuredLog):Promise<void>{
  for(let i=0;i<PROCESSING.batch;i++){
    const notice=await state.reserve();if(!notice)break;
    try{await transport.enqueue(notice);log({event:'dispatched',...notice});}
    catch{log({event:'dispatch_deferred',...notice});}
  }
}
export function startConsumer(state:ProcessingState,url:string,log:Logger=structuredLog){
  const connection=new Redis(url,{maxRetriesPerRequest:null});connection.on('error',()=>{});
  const worker=new Worker<Notice>(QUEUE_NAME,async job=>{
    const notice=job.data;
    if(!notice||!validId(notice.importId)||![1,2].includes(notice.run)||Object.keys(notice).some(k=>!['importId','run'].includes(k)))return;
    await processNotice(state,notice,log);
  },{connection,concurrency:1,lockDuration:30_000,stalledInterval:5_000,maxStalledCount:1});
  worker.on('error',()=>log({event:'transport_worker_unavailable'}));
  worker.on('failed',()=>log({event:'transport_job_failed'}));
  return{worker,connection,async close(){await worker.close();connection.disconnect();}};
}
