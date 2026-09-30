export interface Config { mongoUri: string; database: string; issuer: string; audience: string; roleClient: string; uiOrigin: string; port: number }
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const required = (key: string): string => { const value = env[key]; if (!value?.trim()) throw new Error(`Missing configuration: ${key}`); return value; };
  const issuer = required('OIDC_ISSUER');
  const url = new URL(issuer);
  if (url.username || url.password || url.search || url.hash || issuer.endsWith('/') || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname)))) throw new Error('Invalid OIDC issuer configuration');
  const uiOrigin = required('UI_ORIGIN'); if (new URL(uiOrigin).origin !== uiOrigin) throw new Error('UI_ORIGIN must be an exact origin');
  const database=required('MONGO_DATABASE'); if (!/^[A-Za-z0-9_-]{1,64}$/u.test(database)) throw new Error('Invalid database name');
  const port=Number(env['PORT'] ?? '3000'); if (!Number.isInteger(port) || port<0 || port>65535) throw new Error('Invalid PORT');
  return {mongoUri:required('MONGO_URI'),database,issuer,audience:required('OIDC_AUDIENCE'),roleClient:required('OIDC_ROLE_CLIENT'),uiOrigin,port};
}
