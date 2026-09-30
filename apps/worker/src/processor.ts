import { setImmediate } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import { MongoNetworkError, MongoServerSelectionError, MongoOperationTimeoutError, MongoServerError } from 'mongodb';
import { InputError, parseShipmentCsv, validationSteps } from '../../../packages/input/src/index.js';
import { PROCESSING, ProcessingFailure, ProcessingState } from './state.js';
import type { Notice } from './state.js';
import type { ImportDoc } from '../../api/src/store.js';
export type LogEvent={event:string;importId?:string;run?:number;attempt?:number;code?:string;durationMs?:number};
export type Logger=(event:LogEvent)=>void;
// Explicit allowlist: never serialize arbitrary exceptions, identity, input, tokens, or leases.
export const structuredLog:Logger=e=>{process.stdout.write(JSON.stringify({time:new Date().toISOString(),event:e.event,...(e.importId?{importId:e.importId}:{}),...(e.run?{run:e.run}:{}),...(e.attempt?{attempt:e.attempt}:{}),...(e.code?{code:e.code}:{}),...(e.durationMs!==undefined?{durationMs:e.durationMs}:{})})+'\n');};
export async function calculate(doc:ImportDoc){
  const start=performance.now(),steps=validationSteps(parseShipmentCsv(doc.inputBytes.buffer));
  for(;;){
    await setImmediate();
    if(performance.now()-start>PROCESSING.deadlineMs)throw new ProcessingFailure('PROCESSING_DEADLINE',true);
    const step=steps.next();
    if(performance.now()-start>PROCESSING.deadlineMs)throw new ProcessingFailure('PROCESSING_DEADLINE',true);
    if(step.done)return step.value;
  }
}
export function classify(error:unknown):ProcessingFailure{
  if(error instanceof ProcessingFailure)return error;
  if(error instanceof InputError)return new ProcessingFailure('INVALID_STORED_INPUT',false);
  if(error instanceof MongoNetworkError||error instanceof MongoServerSelectionError||error instanceof MongoOperationTimeoutError)return new ProcessingFailure('TRANSIENT_DEPENDENCY',true);
  if(error instanceof MongoServerError&&(error.hasErrorLabel('RetryableWriteError')||[64,91,189,10107,11600,11602,13435,13436].includes(Number(error.code))))return new ProcessingFailure('TRANSIENT_DEPENDENCY',true);
  return new ProcessingFailure('INTERNAL_PROCESSING',false);
}
export async function processNotice(state:ProcessingState,notice:Notice,log:Logger=structuredLog):Promise<void>{
  // A claim failure is deliberately left to redispatch; no processing attempt is invented.
  const started=performance.now();
  const doc=await state.claim(notice);if(!doc){log({event:'notification_ignored',...notice});return;}
  const context={importId:doc._id,run:doc.run,attempt:doc.attempt};log({event:'claimed',...context});
  try{
    const result=await calculate(doc);
    const published=await state.publish(doc,result);
    log({event:published?'published':'stale_publication_rejected',...context,durationMs:Math.round(performance.now()-started)});
  }catch(error){
    const failure=classify(error);
    try{const recorded=await state.fail(doc,failure);log({event:recorded?'attempt_failed':'stale_failure_rejected',...context,code:failure.code});}
    catch{log({event:'failure_record_unavailable',...context,code:'TRANSIENT_DEPENDENCY'});}
    // Failure to persist is recovered by the Mongo lease scanner, even if this transport job completes.
  }
}
