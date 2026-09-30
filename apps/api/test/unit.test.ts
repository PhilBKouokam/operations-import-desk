import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapIdentity, requireOperator } from '../src/auth.js';
import { ApiError } from '../src/errors.js';
import { loadConfig } from '../src/config.js';
import { pagination, summary, detail } from '../src/store.js';
import type { ImportDoc } from '../src/store.js';
import { UploadLimiter } from '../src/rate-limit.js';
import { safeFilename } from '../src/upload.js';
const cfg={issuer:'https://identity.example/realms/odi',roleClient:'odi-api'};
const claims={iss:cfg.issuer,sub:'owner-a',typ:'Bearer',resource_access:{'odi-api':{roles:['operator']}}};
const status=(code:number)=>(error:unknown)=>error instanceof ApiError&&error.status===code;
test('A15 unit: only configured client roles map, operator wins explicit dual-role mapping',()=>{
  assert.equal(mapIdentity(claims,cfg).role,'operator');
  assert.equal(mapIdentity({...claims,resource_access:{'odi-api':{roles:['viewer']}}},cfg).role,'viewer');
  assert.equal(mapIdentity({...claims,resource_access:{'odi-api':{roles:['viewer','operator']}}},cfg).role,'operator');
  for(const roles of [undefined,{}, {'other':{roles:['operator']}}, {'odi-api':{roles:'operator'}}])assert.throws(()=>mapIdentity({...claims,resource_access:roles},cfg),status(403));
});
test('A15 unit: missing subject, wrong issuer and ID-token type denied',()=>{
  for(const changes of [{sub:''},{iss:'https://wrong.example'},{typ:'ID'}])assert.throws(()=>mapIdentity({...claims,...changes},cfg),status(401));
  assert.throws(()=>requireOperator({issuer:cfg.issuer,subject:'v',role:'viewer'}),status(403));
});
test('unit: startup configuration rejects missing identity and unsafe issuer',()=>{
  assert.throws(()=>loadConfig({}));
  const env={OIDC_ISSUER:cfg.issuer,OIDC_AUDIENCE:'odi-api',OIDC_ROLE_CLIENT:'odi-api',MONGO_URI:'mongodb://localhost:27017',MONGO_DATABASE:'odi',UI_ORIGIN:'http://127.0.0.1:5173'};
  assert.equal(loadConfig(env).port,3000);
  for(const issuer of ['http://public.example/realm','https://identity.example/realm?x=1','https://user:pass@identity.example/realm'])assert.throws(()=>loadConfig({...env,OIDC_ISSUER:issuer}));
});
test('unit: cursor and query validation reject unknown, injected and malformed shapes',()=>{
  for(const q of [{limit:'0'},{limit:'51'},{limit:['20']},{owner:'someone'},{cursor:'garbage'},{cursor:Buffer.from('["bad-date","bad-id"]').toString('base64url')}])assert.throws(()=>pagination(q),status(400));
  assert.deepEqual(pagination({}),{limit:20,after:null});
});
test('unit: response allowlists exclude private fields even when extra fields exist',()=>{
  const date=new Date('2026-01-01T00:00:00.000Z');
  const doc={_id:'id',filename:'test.csv',byteSize:10,state:'PENDING',run:1,attempt:0,createdAt:date,updatedAt:date,nextAttemptAt:date,startedAt:null,finishedAt:null,events:[],owner:{issuer:'SECRET',subject:'SECRET'},inputBytes:'SECRET',leaseToken:'SECRET',contentHash:'SECRET',nextDispatchAt:date,token:'SECRET',internal:'SECRET'} as unknown as ImportDoc;
  assert.ok(!JSON.stringify(summary(doc)).includes('SECRET'));assert.ok(!JSON.stringify(detail(doc)).includes('SECRET'));
});
test('unit: bounded rate limiter independently enforces subject and IP and expires windows',()=>{
  let time=0;const limiter=new UploadLimiter(()=>time);
  for(let i=0;i<10;i++)limiter.consume('a','ip');
  assert.throws(()=>limiter.consume('b','ip'),status(429));assert.throws(()=>limiter.consume('a','other-ip'),status(429));
  time=60000;limiter.consume('a','ip');
});
test('A16 unit: display filename strips path/control characters and limits code points',()=>{
  assert.equal(safeFilename('../../secret\\hello\u0000.csv'),'hello.csv');
  assert.equal([...safeFilename('😀'.repeat(130)+'.csv')].length,120);
});
