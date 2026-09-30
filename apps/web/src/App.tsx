import {useEffect,useRef,useState} from 'react';
import type {Role} from './contracts';
import {Link} from './components';
import {Submit} from './Submit';
import {History} from './History';
import {Details} from './Details';
export function App({role}:{role:Role}){
  const [path,setPath]=useState(location.pathname),first=useRef(true);
  useEffect(()=>{const change=()=>setPath(location.pathname);window.addEventListener('popstate',change);return()=>window.removeEventListener('popstate',change);},[]);
  useEffect(()=>{document.title=`${path==='/submit'?'Submit':path==='/imports'?'Import History':'Import Details'} · Operations Import Desk`;if(first.current){first.current=false;return;}document.querySelector<HTMLElement>('h1')?.focus();},[path]);
  const id=path.match(/^\/imports\/([0-9a-f-]{36})$/u)?.[1];
  return <><a className="skip" href="#main">Skip to content</a><header><div className="brand">Operations <strong>Import Desk</strong></div><span className="role">{role==='operator'?'Operator':'Viewer'} access</span><nav aria-label="Main navigation"><Link to="/submit" {...(path==='/submit'?{'aria-current':'page' as const}:{})}>Submit</Link><Link to="/imports" {...(path==='/imports'?{'aria-current':'page' as const}:{})}>Import History</Link></nav></header><main id="main" tabIndex={-1}>{path==='/submit'?<Submit role={role}/>:path==='/imports'?<History/>:id?<Details key={id} id={id} role={role}/>:<><h1 tabIndex={-1}>Page not found</h1><Link to="/imports">Return to Import History</Link></>}</main><footer>Shipment validation · Synthetic demonstration data only</footer></>;
}
