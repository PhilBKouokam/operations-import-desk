import type {MouseEvent,ReactNode} from 'react';
import type {Summary} from './contracts';
import {stateLabel} from './contracts';
import {errorText} from './api';
import {SessionExpired,signIn} from './auth';
function go(path:string){history.pushState(null,'',path);window.dispatchEvent(new PopStateEvent('popstate'));}
export function Link({to,children,...props}:{to:string;children:ReactNode;className?:string;'aria-current'?:'page'}){return <a href={to} {...props} onClick={(e:MouseEvent<HTMLAnchorElement>)=>{if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey&&e.button===0){e.preventDefault();go(to);}}}>{children}</a>;}
export function Status({state}:{state:Summary['state']}){return <span className={`status state-${state}`}>{stateLabel[state]}</span>;}
export function ErrorBox({error,retry}:{error:unknown;retry?:()=>void}){return <div className="notice error" role="alert"><p>{errorText(error)}</p>{error instanceof SessionExpired?<button onClick={()=>void signIn()}>Sign in again</button>:retry&&<button className="secondary" onClick={retry}>Try again</button>}</div>;}
export function Counts({doc}:{doc:Summary}){return doc.counts?<span>{doc.counts.validCount} accepted · {doc.counts.rejectedCount} rejected</span>:<span className="muted">Not available yet</span>;}
