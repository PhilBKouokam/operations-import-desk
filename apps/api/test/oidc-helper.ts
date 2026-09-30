import { createHash, randomBytes } from 'node:crypto';
export interface Tokens {access_token:string;id_token:string;expires_in:number}
/** Test-only browser-flow driver. Real Keycloak login + Authorization Code with PKCE. */
export async function login(issuer:string,username:string,client='odi-web'):Promise<Tokens>{
  const verifier=randomBytes(32).toString('base64url'),state=randomBytes(16).toString('hex'),nonce=randomBytes(16).toString('hex');
  const redirect='http://127.0.0.1:5173/callback';
  const query=new URLSearchParams({client_id:client,redirect_uri:redirect,response_type:'code',scope:'openid',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
  const page=await fetch(`${issuer}/protocol/openid-connect/auth?${query}`,{redirect:'manual'});
  const html=await page.text();const action=html.match(/<form[^>]*action="([^"]+)"/u)?.[1]?.replaceAll('&amp;','&');
  if(!action)throw new Error('Keycloak login form unavailable');
  const cookies=page.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  const signed=await fetch(action,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',cookie:cookies},body:new URLSearchParams({username,password:'Local-demo-only-123!',credentialId:''}),redirect:'manual'});
  const location=signed.headers.get('location');if(!location)throw new Error(`Keycloak login did not redirect (${signed.status})`);
  const callback=new URL(location);if(callback.searchParams.get('state')!==state)throw new Error('State mismatch');
  const code=callback.searchParams.get('code');if(!code)throw new Error('Authorization code missing');
  const response=await fetch(`${issuer}/protocol/openid-connect/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client,redirect_uri:redirect,code,code_verifier:verifier})});
  if(!response.ok)throw new Error(`Code exchange failed (${response.status})`);
  return await response.json() as Tokens;
}
