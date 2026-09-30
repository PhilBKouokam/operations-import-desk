import Keycloak from 'keycloak-js';
const RETURN_PATH='odi.returnPath';
function allowedPath(path:string){return /^\/(?:submit|imports(?:\/[0-9a-f-]{36})?)$/u.test(path)?path:'/imports';}
function origin(value:string){const url=new URL(value);if(url.origin!==value||!(url.protocol==='https:'||(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))))throw new Error('Invalid configuration');return value;}
const provider=origin(import.meta.env.VITE_OIDC_URL??'http://127.0.0.1:8080');
export const apiOrigin=origin(import.meta.env.VITE_API_ORIGIN??'http://127.0.0.1:3000');
const keycloak=new Keycloak({url:provider,realm:import.meta.env.VITE_OIDC_REALM??'operations-import-desk',clientId:import.meta.env.VITE_OIDC_CLIENT??'odi-web'});
export class SessionExpired extends Error {constructor(){super('Your session has ended. Sign in again to continue.');}}
export async function initialize(){
  if(location.pathname!=='/callback')sessionStorage.setItem(RETURN_PATH,allowedPath(location.pathname));
  await keycloak.init({onLoad:'login-required',flow:'standard',pkceMethod:'S256',responseMode:'query',checkLoginIframe:false,enableLogging:false,redirectUri:location.origin+'/callback'});
  if(!keycloak.authenticated)throw new SessionExpired();
  if(location.pathname==='/callback'||location.pathname==='/')history.replaceState(null,'',allowedPath(sessionStorage.getItem(RETURN_PATH)??'/imports'));
  sessionStorage.removeItem(RETURN_PATH);
}
export async function accessToken(){
  try{await keycloak.updateToken(30);if(!keycloak.token)throw new SessionExpired();return keycloak.token;}catch{throw new SessionExpired();}
}
export async function signIn(){sessionStorage.setItem(RETURN_PATH,allowedPath(location.pathname));await keycloak.login({redirectUri:location.origin+'/callback'});}
// Tokens are held only by the adapter in memory. The only app storage entry is a bounded return path.
