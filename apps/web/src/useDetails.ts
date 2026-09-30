import {useCallback,useEffect,useRef,useState} from 'react';
import {json,RequestError} from './api';
import {SessionExpired} from './auth';
import type {Detail} from './contracts';
import {unfinished} from './contracts';
/** One in-flight fetch, no overlap, no hidden-tab timer, and no terminal polling. */
export function useDetails(id:string){
  const [doc,setDoc]=useState<Detail|null>(null),[error,setError]=useState<unknown>(null),[lastUpdated,setLastUpdated]=useState<string|null>(null);
  const refreshRef=useRef<()=>void>(()=>{});
  useEffect(()=>{
    let disposed=false,timer:ReturnType<typeof setTimeout>|undefined,active:AbortController|undefined,current:Detail|null=null,blocked=false;
    const clear=()=>{if(timer)clearTimeout(timer);timer=undefined;};
    const schedule=()=>{clear();if(!disposed&&!blocked&&document.visibilityState==='visible'&&(!current||unfinished(current.state)))timer=setTimeout(()=>void load(),3000);};
    async function load(){
      if(disposed||active)return;clear();active=new AbortController();
      try{const value=await json<Detail>(`/v1/imports/${id}`,{signal:active.signal});if(disposed)return;current=value;blocked=false;setDoc(value);setLastUpdated(new Date().toISOString());setError(null);}
      catch(e){if(disposed||active.signal.aborted)return;blocked=e instanceof SessionExpired||(e instanceof RequestError&&[403,404].includes(e.status));setError(e);if(blocked){current=null;setDoc(null);}}
      finally{active=undefined;schedule();}
    }
    refreshRef.current=()=>{blocked=false;void load();};
    const visibility=()=>{if(document.visibilityState==='hidden'){clear();active?.abort();}else if(!blocked&&(!current||unfinished(current.state)))void load();};
    document.addEventListener('visibilitychange',visibility);void load();
    return()=>{disposed=true;clear();active?.abort();document.removeEventListener('visibilitychange',visibility);refreshRef.current=()=>{};};
  },[id]);
  const refresh=useCallback(()=>refreshRef.current(),[]);
  return{doc,error,lastUpdated,refresh};
}
