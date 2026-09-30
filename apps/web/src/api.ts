import {accessToken,apiOrigin,SessionExpired} from './auth';
export class RequestError extends Error {constructor(readonly status:number,readonly code:string,message:string){super(message);}}
const structural:Record<string,string>={INVALID_HEADER:'Use the six required column names in exactly the order shown.',COLUMN_COUNT:'Every record must have exactly six columns.',INVALID_UTF8:'Save the file as UTF-8 CSV.',INVALID_LINE_ENDING:'Use LF or CRLF line endings.',EMPTY_RECORD:'Remove empty records inside the file.',RECORD_TOO_LARGE:'A record exceeds the 4 KiB limit.',INVALID_CSV:'Check CSV quoting. Embedded line breaks are not supported.',CELL_TOO_LONG:'A cell exceeds 128 Unicode characters.',NO_DATA:'Include at least one shipment row after the header.',TOO_MANY_RECORDS:'Use no more than 1,000 shipment rows.'};
function message(status:number,code:string){return structural[code]??({400:'The request was not valid. Check your input and try again.',401:'Your session has ended. Sign in again to continue.',403:'Your account is not allowed to perform this action.',404:'Import not found. It may not exist or belong to your account.',409:'This action is not available in the current import state. Refresh the import.',413:'The file or upload is too large. Choose one CSV of at most 256 KiB.',415:'Choose a UTF-8 CSV file.',422:'The CSV structure is invalid. Check the schema and limits below.',429:'Too many uploads. Wait a minute before trying again.'}[status]??'The service is unavailable. Try again.');}
export function errorText(error:unknown){return error instanceof RequestError||error instanceof SessionExpired?error.message:'Could not reach the service. Try again.';}
async function request(path:string,init:RequestInit={}){
  const token=await accessToken();
  const response=await fetch(apiOrigin+path,{...init,headers:{...init.headers,Authorization:`Bearer ${token}`},credentials:'omit',cache:'no-store',redirect:'error',signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
  if(!response.ok){let code='';try{const body=await response.json();if(typeof body?.error?.code==='string')code=body.error.code;}catch{/* Never display response bodies or exceptions. */}if(response.status===401)throw new SessionExpired();throw new RequestError(response.status,code,message(response.status,code));}
  return response;
}
export async function json<T>(path:string,init:RequestInit={}):Promise<T>{return await(await request(path,init)).json() as T;}
export async function download(id:string,kind:'accepted'|'errors'){
  const response=await request(`/v1/imports/${id}/download?kind=${kind}`),blob=await response.blob(),url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');anchor.href=url;anchor.download=`import-${id}-${kind}.csv`;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
