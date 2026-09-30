import { randomUUID } from 'node:crypto';
import { BSON } from 'mongodb';
import type { Filter, Document } from 'mongodb';
import type { ImportDoc, ImportStore } from '../../api/src/store.js';
import type { ValidationResult } from '../../../packages/input/src/index.js';

export const PROCESSING = Object.freeze({leaseMs:60_000,deadlineMs:30_000,dispatchMs:30_000,scanMs:5_000,batch:100,documentBytes:4*1024*1024,attempts:3});
export type Notice={importId:string;run:1|2};
export const notificationId=({importId,run}:Notice)=>`import-${importId}-run-${run}`;
export type FailureCode='TRANSIENT_DEPENDENCY'|'PROCESSING_DEADLINE'|'LEASE_EXPIRED'|'RESULT_TOO_LARGE'|'INVALID_STORED_INPUT'|'INTERNAL_PROCESSING';
const messages:Record<FailureCode,string>={TRANSIENT_DEPENDENCY:'A dependency was temporarily unavailable.',PROCESSING_DEADLINE:'Processing exceeded its time limit.',LEASE_EXPIRED:'Processing was interrupted.',RESULT_TOO_LARGE:'The result exceeds the supported size.',INVALID_STORED_INPUT:'Stored input could not be processed.',INTERNAL_PROCESSING:'Processing could not complete.'};
export class ProcessingFailure extends Error {constructor(readonly code:FailureCode,readonly retryable:boolean){super(code);}}
const event=(reasonCode:string,attempt:unknown='$attempt'):Document=>({$slice:[{$concatArrays:['$events',[{time:'$$NOW',run:'$run',attempt,reasonCode,actor:'system'}]]},-32]});
export class ProcessingState {
  constructor(readonly store:ImportStore){}
  async reserve():Promise<Notice|null>{
    const doc=await this.store.collection.findOneAndUpdate({state:'PENDING',$expr:{$and:[{$lte:['$nextAttemptAt','$$NOW']},{$lte:['$nextDispatchAt','$$NOW']}] }},[{$set:{nextDispatchAt:{$add:['$$NOW',PROCESSING.dispatchMs]}}}],{sort:{nextDispatchAt:1,_id:1},returnDocument:'after',projection:{_id:1,run:1}});
    return doc?{importId:doc._id,run:doc.run}:null;
  }
  async claim(notice:Notice):Promise<ImportDoc|null>{
    return this.store.collection.findOneAndUpdate({_id:notice.importId,run:notice.run,state:'PENDING',attempt:{$lt:PROCESSING.attempts},$expr:{$lte:['$nextAttemptAt','$$NOW']}},[{$set:{state:'PROCESSING',attempt:{$add:['$attempt',1]},leaseToken:{$literal:randomUUID()},leaseExpiresAt:{$add:['$$NOW',PROCESSING.leaseMs]},startedAt:{$ifNull:['$startedAt','$$NOW']},updatedAt:'$$NOW',events:event('CLAIMED',{$add:['$attempt',1]})}}],{returnDocument:'after'});
  }
  private fence(doc:ImportDoc):Filter<ImportDoc>{return {_id:doc._id,run:doc.run,state:'PROCESSING',leaseToken:doc.leaseToken,$expr:{$gt:['$leaseExpiresAt','$$NOW']}};}
  async publish(doc:ImportDoc,result:ValidationResult):Promise<boolean>{
    // Include a conservative reserve for event/timestamp changes, then publish the entire result once.
    if(BSON.calculateObjectSize({...doc,result})+8192>PROCESSING.documentBytes)throw new ProcessingFailure('RESULT_TOO_LARGE',false);
    const state=result.rejectedCount?'COMPLETED_WITH_ERRORS':'COMPLETED';
    const write=await this.store.collection.updateOne(this.fence(doc),[{$set:{state,result:{$literal:result},finishedAt:'$$NOW',updatedAt:'$$NOW',leaseToken:null,leaseExpiresAt:null,lastFailure:null,events:event(state)}}]);
    return write.modifiedCount===1;
  }
  private failureUpdate(code:FailureCode,retryable:boolean):Document[]{
    const exhausted:unknown=retryable?{$gte:['$attempt',PROCESSING.attempts]}:true;
    const due={$add:['$$NOW',{$cond:[{$eq:['$attempt',1]},2000,4000]}]};
    return [{$set:{state:{$cond:[exhausted,'FAILED','PENDING']},updatedAt:'$$NOW',finishedAt:{$cond:[exhausted,'$$NOW',null]},nextAttemptAt:due,nextDispatchAt:due,leaseToken:null,leaseExpiresAt:null,result:null,lastFailure:{code,safeMessage:messages[code],retryable,occurredAt:'$$NOW'},events:event(code)}}];
  }
  async fail(doc:ImportDoc,error:ProcessingFailure):Promise<boolean>{return (await this.store.collection.updateOne(this.fence(doc),this.failureUpdate(error.code,error.retryable))).modifiedCount===1;}
  async recover():Promise<number>{
    let recovered=0;
    for(let i=0;i<PROCESSING.batch;i++){
      const doc=await this.store.collection.findOneAndUpdate({state:'PROCESSING',$expr:{$lte:['$leaseExpiresAt','$$NOW']}},this.failureUpdate('LEASE_EXPIRED',true),{sort:{leaseExpiresAt:1},returnDocument:'after'});
      if(!doc)break;recovered++;
    }
    return recovered;
  }
}
