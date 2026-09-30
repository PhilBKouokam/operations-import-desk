import {createRoot} from 'react-dom/client';
import {initialize,signIn} from './auth';
import {json,errorText} from './api';
import type {Role} from './contracts';
import {App} from './App';
import './style.css';
const root=createRoot(document.getElementById('root')!);
root.render(<main className="boot"><h1>Operations Import Desk</h1><p role="status">Connecting to your sign-in provider…</p></main>);
try{await initialize();const me=await json<{role:Role}>('/v1/me');if(!['operator','viewer'].includes(me.role))throw new Error();root.render(<App role={me.role}/>);}
catch(error){root.render(<main className="boot"><h1>Operations Import Desk</h1><div role="alert"><p>{errorText(error)}</p><p>Application access could not be established.</p></div><button onClick={()=>void signIn()}>Sign in again</button></main>);}
