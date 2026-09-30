import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import type {Role,Summary} from './contracts';
import {json,RequestError} from './api';
import {Link,Status,ErrorBox} from './components';
export function Submit({role}:{role:Role}){
  const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),[accepted,setAccepted]=useState<{import:Summary;duplicate:boolean}|null>(null);
  const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  async function submit(event:FormEvent){event.preventDefault();if(!file||busy)return;setError(null);setAccepted(null);
    if(file.size>262144){setError(new RequestError(413,'FILE_TOO_LARGE','Choose a CSV no larger than 256 KiB.'));return;}
    setBusy(true);const form=new FormData();form.append('file',file);
    try{const value=await json<{import:Summary;duplicate:boolean}>('/v1/imports',{method:'POST',body:form});if(alive.current)setAccepted(value);}
    catch(e){if(alive.current)setError(e);}finally{if(alive.current)setBusy(false);}
  }
  return <><div className="page-heading"><p className="eyebrow">SHIPMENT VALIDATION</p><h1 tabIndex={-1}>Submit an import</h1><p>Check shipment records and separate accepted rows from rows that need attention.</p></div>
    <div className="split"><section className="panel" aria-labelledby="upload-title"><h2 id="upload-title">Choose your CSV</h2><p>Your file is saved first. Validation happens afterward.</p>
      {role==='viewer'?<div className="notice">You have viewer access. You can read your imports in <Link to="/imports">Import History</Link>, but cannot submit or retry files.</div>:<form onSubmit={e=>void submit(e)}>
        <label htmlFor="csv">Shipment CSV</label><input id="csv" name="file" type="file" accept=".csv,text/csv" required disabled={busy} aria-invalid={Boolean(error)} aria-describedby={`upload-help${error?' upload-error':''}`} onChange={e=>{setFile(e.target.files?.[0]??null);setError(null);setAccepted(null);}}/>
        <p id="upload-help" className="help">One UTF-8 CSV · 256 KiB maximum · 1,000 shipment rows</p>
        {Boolean(error)&&<div id="upload-error"><ErrorBox error={error}/><p className="help">If an upload response was lost, resubmit the same file to recover its existing import.</p></div>}
        <button type="submit" disabled={!file||busy}>{busy?'Saving file…':'Submit import'}</button><p role="status" className="help">{busy?'Waiting for the API to confirm your file is saved.':''}</p>
      </form>}
      {accepted&&<div className="notice success" role="status"><h3>{accepted.duplicate?'Existing import found':'File saved'}</h3><p>{accepted.duplicate?'These exact bytes were already submitted by your account. No new import was created.':'The API confirmed your file is durably saved.'}</p><p><Status state={accepted.import.state}/></p><Link className="button" to={`/imports/${accepted.import.id}`}>View import details</Link></div>}
    </section><section className="panel" aria-labelledby="format-title"><h2 id="format-title">File requirements</h2><p>Use these six columns in this exact order:</p><code className="schema">shipment_id,origin_code,destination_code,scheduled_date,weight_kg,carrier_code</code>
    <dl className="rules"><dt>Shipment ID</dt><dd>1–32 uppercase letters, digits, hyphens or underscores. Start with a letter or digit; IDs must be unique within the file.</dd><dt>Origin / destination</dt><dd>2–8 uppercase letters or digits; locations must differ.</dd><dt>Scheduled date</dt><dd>A real date in YYYY-MM-DD format, from 2000 through 2099.</dd><dt>Weight (kg)</dt><dd>Greater than 0, at most 100000; up to 3 decimal places, no signs or exponents.</dd><dt>Carrier</dt><dd>2–12 uppercase letters or digits.</dd></dl>
    <p className="help">Up to 128 Unicode characters per cell and 4 KiB per record. LF or CRLF line endings; optional UTF-8 BOM. No embedded line breaks or empty records. Quoted commas and doubled quotes are supported.</p>
    <div className="actions"><a href="/samples/valid.csv" download>Download valid sample</a><a href="/samples/invalid-rows.csv" download>Download invalid-row sample</a></div></section></div></>;
}
