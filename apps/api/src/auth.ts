import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';
import type { Config } from './config.js';
import { ApiError } from './errors.js';
import type { ApiRequest } from './errors.js';
export interface Identity { issuer: string; subject: string; role: 'operator'|'viewer' }
export type AuthRequest = ApiRequest & { identity: Identity };
export function mapIdentity(payload: JWTPayload, config: Pick<Config,'issuer'|'roleClient'>): Identity {
  if(payload.iss!==config.issuer || typeof payload.sub!=='string' || !payload.sub || payload.sub.length>256 || payload.typ!=='Bearer') throw new ApiError(401,'INVALID_TOKEN','A valid access token is required.');
  const access=payload.resource_access;
  const client=access && typeof access==='object' ? (access as Record<string,unknown>)[config.roleClient]:undefined;
  const roles=client && typeof client==='object' ? (client as Record<string,unknown>).roles:undefined;
  const role=Array.isArray(roles) && roles.includes('operator')?'operator':Array.isArray(roles) && roles.includes('viewer')?'viewer':null;
  if(!role) throw new ApiError(403,'ROLE_REQUIRED','This account does not have application access.');
  return Object.freeze({issuer:config.issuer,subject:payload.sub,role});
}
export class TokenVerifier {
  private constructor(private config:Config,private keys:ReturnType<typeof createRemoteJWKSet>) {}
  static async create(config:Config):Promise<TokenVerifier> {
    const response=await fetch(`${config.issuer}/.well-known/openid-configuration`,{signal:AbortSignal.timeout(5000),redirect:'error'});
    if(!response.ok) throw new Error('OIDC discovery unavailable');
    const discovery=await response.json() as {issuer?:string;jwks_uri?:string};
    if(discovery.issuer!==config.issuer || !discovery.jwks_uri || new URL(discovery.jwks_uri).origin!==new URL(config.issuer).origin) throw new Error('OIDC discovery mismatch');
    return new TokenVerifier(config,createRemoteJWKSet(new URL(discovery.jwks_uri),{timeoutDuration:3000,cooldownDuration:1000,cacheMaxAge:300000}));
  }
  async verify(header: string|undefined):Promise<Identity> {
    if(!header || header.length>16384 || !/^Bearer [A-Za-z0-9_.-]+$/u.test(header)) throw new ApiError(401,'INVALID_TOKEN','A valid access token is required.');
    let payload:JWTPayload;
    try {
      ({payload}=await jwtVerify(header.slice(7),this.keys,{issuer:this.config.issuer,audience:this.config.audience,algorithms:['RS256'],clockTolerance:30,requiredClaims:['iss','sub','aud','exp','iat']}));
    } catch { throw new ApiError(401,'INVALID_TOKEN','A valid access token is required.'); }
    return mapIdentity(payload,this.config);
  }
}
@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(private readonly verifier:TokenVerifier) {}
  async canActivate(context:ExecutionContext):Promise<boolean> {
    const req=context.switchToHttp().getRequest<AuthRequest>();
    req.identity=await this.verifier.verify(req.headers.authorization);return true;
  }
}
export function requireOperator(identity:Identity):void { if(identity.role!=='operator') throw new ApiError(403,'FORBIDDEN','Operator access is required.'); }
