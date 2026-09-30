import type { Request } from 'express';
import { ApiError } from './errors.js';
/** Tiny, bounded JSON envelope; no global body parser on the streaming upload route. */
export async function readRetry(req:Request):Promise<void>{
  const invalid=()=>new ApiError(400,'INVALID_RETRY','Expected only expectedRun: 1.');
  if(Object.keys(req.query).length||!/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(req.headers['content-type']??''))throw invalid();
  let length=0;const chunks:Buffer[]=[];
  for await(const chunk of req){length+=chunk.length;if(length>128)throw new ApiError(413,'BODY_TOO_LARGE','Retry request is too large.');chunks.push(Buffer.from(chunk));}
  try{const body:unknown=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||!('expectedRun'in body)||body.expectedRun!==1)throw invalid();}catch{throw invalid();}
}
