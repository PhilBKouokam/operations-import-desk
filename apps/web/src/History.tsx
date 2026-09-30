import {useEffect,useState} from 'react';
import type {Summary} from './contracts';
import {time} from './contracts';
import {json} from './api';
import {Link,Status,Counts,ErrorBox} from './components';
export function History(){
  const [page,setPage]=useState<{items:Summary[];nextCursor:string|null}|null>(null),[cursor,setCursor]=useState<string|null>(null),[previous,setPrevious]=useState<(string|null)[]>([]),[error,setError]=useState<unknown>(null),[loading,setLoading]=useState(true),[reload,setReload]=useState(0);
  useEffect(()=>{const control=new AbortController();setLoading(true);setError(null);void json<{items:Summary[];nextCursor:string|null}>(`/v1/imports?limit=20${cursor?'&cursor='+encodeURIComponent(cursor):''}`,{signal:control.signal}).then(setPage).catch(e=>{if(!control.signal.aborted)setError(e);}).finally(()=>{if(!control.signal.aborted)setLoading(false);});return()=>control.abort();},[cursor,reload]);
  return <><div className="page-heading"><p className="eyebrow">YOUR IMPORTS</p><h1 tabIndex={-1}>Import History</h1><p>Files submitted by your account, newest first.</p></div><section className="panel">
    {loading?<p role="status">Loading imports…</p>:error?<ErrorBox error={error} retry={()=>setReload(n=>n+1)}/>:!page?.items.length?<div className="empty"><h2>No imports yet</h2><p>Your saved imports will appear here.</p><Link to="/submit">Go to Submit</Link></div>:<div className="table-wrap" tabIndex={0} role="region" aria-label="Imports table"><table><caption className="sr-only">Your imports, newest first</caption><thead><tr><th scope="col">File</th><th scope="col">Submitted</th><th scope="col">State</th><th scope="col">Results</th></tr></thead><tbody>{page.items.map(doc=><tr key={doc.id}><th scope="row"><Link to={`/imports/${doc.id}`}>{doc.filename}</Link></th><td><time dateTime={doc.createdAt}>{time(doc.createdAt)}</time></td><td><Status state={doc.state}/></td><td><Counts doc={doc}/></td></tr>)}</tbody></table></div>}
    <div className="pagination" aria-label="Import pages"><button className="secondary" disabled={loading||previous.length===0} onClick={()=>{setCursor(previous.at(-1)??null);setPrevious(p=>p.slice(0,-1));}}>Previous page</button><span>Page {previous.length+1}</span><button className="secondary" disabled={loading||Boolean(error)||!page?.nextCursor} onClick={()=>{setPrevious(p=>[...p,cursor]);setCursor(page!.nextCursor);}}>Next page</button></div>
  </section></>;
}
