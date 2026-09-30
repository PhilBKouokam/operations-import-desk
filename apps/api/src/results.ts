import { COLUMNS, formatKilograms } from '../../../packages/input/src/index.js';
import type { ImportDoc } from './store.js';
import { ApiError } from './errors.js';
export function completedResult(doc:ImportDoc){
  if(!['COMPLETED','COMPLETED_WITH_ERRORS'].includes(doc.state)||!doc.result)throw new ApiError(409,'RESULTS_NOT_READY','Results are not available.');
  return doc.result;
}
export function csvCell(value:unknown):string{
  let text=String(value);
  if(/^\s*[=+\-@]/u.test(text)||/^[\s]*[\t\r]/u.test(text))text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
export function exportCsv(doc:ImportDoc,kind:'accepted'|'errors'):string{
  const result=completedResult(doc);
  const rows:unknown[][]=kind==='accepted'?[Array.from(COLUMNS),...result.acceptedRows.map(r=>[r.shipment_id,r.origin_code,r.destination_code,r.scheduled_date,formatKilograms(r.weightGrams),r.carrier_code])]:[
    ['record_number','field','code','message',...COLUMNS],
    ...result.rejectedRows.flatMap(r=>r.errors.map(e=>[r.recordNumber,e.field,e.code,e.message,...COLUMNS.map(c=>r.values[c])]))];
  return rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
export function errorPage(doc:ImportDoc,query:Record<string,unknown>){
  const invalid=()=>new ApiError(400,'INVALID_QUERY','Invalid error pagination.');
  if(Object.keys(query).some(k=>!['offset','limit'].includes(k)))throw invalid();
  const offset=query.offset??'0',limit=query.limit??'50';
  if(typeof offset!=='string'||typeof limit!=='string'||!/^\d{1,4}$/u.test(offset)||!/^\d{1,3}$/u.test(limit)||Number(limit)<1||Number(limit)>100)throw invalid();
  const rows=completedResult(doc).rejectedRows,start=Number(offset),end=start+Number(limit);
  return{items:rows.slice(start,end),total:rows.length,nextOffset:end<rows.length?end:null};
}
