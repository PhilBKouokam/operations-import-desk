import Busboy from 'busboy';
import type { Request } from 'express';
import { LIMITS, parseShipmentCsv } from '../../../packages/input/src/index.js';
import { ApiError } from './errors.js';
export const MAX_ENVELOPE_BYTES=LIMITS.fileBytes+16*1024;
export function safeFilename(name:string):string {
  const leaf=name.replaceAll('\\','/').split('/').at(-1) ?? '';
  return [...leaf.replace(/[\p{Cc}\p{Cf}]/gu,'').trim()].slice(0,120).join('') || 'upload.csv';
}
export async function readUpload(req:Request):Promise<{filename:string;bytes:Buffer}> {
  if(!/^multipart\/form-data(?:;|$)/iu.test(req.headers['content-type']??'')) throw new ApiError(415,'UNSUPPORTED_MEDIA_TYPE','Send one CSV file as multipart/form-data.');
  if(req.headers['content-encoding'] && req.headers['content-encoding']!=='identity') throw new ApiError(415,'UNSUPPORTED_ENCODING','Compressed uploads are not supported.');
  const length=req.headers['content-length'];
  if(length && (!/^\d+$/u.test(length) || Number(length)>MAX_ENVELOPE_BYTES)) throw new ApiError(413,'ENVELOPE_TOO_LARGE','The upload envelope is too large.');
  const result=await new Promise<{filename:string;bytes:Buffer}>((resolve,reject)=>{
    let parser:ReturnType<typeof Busboy>;
    try {parser=Busboy({headers:req.headers,limits:{files:1,fields:0,parts:2,fileSize:LIMITS.fileBytes+1,fieldNameSize:32,headerPairs:100}});}
    catch {reject(new ApiError(400,'INVALID_MULTIPART','Malformed multipart upload.'));return;}
    let settled=false,total=0,fileBytes=0,filename='',fileCount=0;
    const chunks:Buffer[]=[];
    const cleanup=():void=>{clearTimeout(timer);req.off('data',count);req.off('aborted',aborted);req.off('error',failed);};
    const fail=(error:unknown):void=>{
      if(settled)return;settled=true;cleanup();req.unpipe(parser);parser.destroy();req.resume();reject(error);
    };
    const failed=():void=>fail(new ApiError(400,'INVALID_MULTIPART','Malformed multipart upload.'));
    const aborted=():void=>fail(new ApiError(400,'UPLOAD_ABORTED','Upload interrupted.'));
    const count=(chunk:Buffer):void=>{total+=chunk.length;if(total>MAX_ENVELOPE_BYTES)fail(new ApiError(413,'ENVELOPE_TOO_LARGE','The upload envelope is too large.'));};
    const timer=setTimeout(()=>fail(new ApiError(400,'UPLOAD_TIMEOUT','Upload did not finish in time.')),10000);
    parser.on('file',(field,stream,info)=>{
      stream.on('error',failed);
      fileCount++;
      if(field!=='file' || fileCount!==1){stream.resume();fail(new ApiError(400,'INVALID_MULTIPART','Exactly one file field is required.'));return;}
      if(!/\.csv$/iu.test(info.filename) || !['text/csv','application/csv','application/octet-stream','application/vnd.ms-excel'].includes(info.mimeType)){stream.resume();fail(new ApiError(415,'UNSUPPORTED_FILE','A CSV file is required.'));return;}
      filename=safeFilename(info.filename);
      stream.on('limit',()=>fail(new ApiError(413,'FILE_TOO_LARGE','The CSV exceeds 256 KiB.')));
      stream.on('data',(chunk:Buffer)=>{fileBytes+=chunk.length;if(fileBytes>LIMITS.fileBytes)fail(new ApiError(413,'FILE_TOO_LARGE','The CSV exceeds 256 KiB.'));else if(!settled)chunks.push(chunk);});
    });
    for(const event of ['field','filesLimit','fieldsLimit','partsLimit'] as const)parser.on(event,()=>fail(new ApiError(400,'INVALID_MULTIPART','Exactly one file field and no other fields are allowed.')));
    parser.on('error',failed);
    parser.on('close',()=>{
      if(settled)return;
      if(fileCount!==1){fail(new ApiError(400,'FILE_REQUIRED','One CSV file is required.'));return;}
      settled=true;cleanup();resolve({filename,bytes:Buffer.concat(chunks,fileBytes)});
    });
    req.on('data',count);req.on('aborted',aborted);req.on('error',failed);req.pipe(parser);
  });
  parseShipmentCsv(result.bytes); // Throws before persistence; business rules remain M3 work.
  return result;
}
