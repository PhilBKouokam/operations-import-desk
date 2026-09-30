import { createHash, randomUUID } from 'node:crypto';
import { Binary, MongoClient, MongoServerError } from 'mongodb';
import type { Collection, Filter } from 'mongodb';
import type { ValidationResult } from '../../../packages/input/src/index.js';
import type { Identity } from './auth.js';
import type { Config } from './config.js';
import { ApiError } from './errors.js';
export interface ImportDoc {
  _id:string; owner:{issuer:string;subject:string}; schemaVersion:'shipment-v1';contentHash:string;filename:string;byteSize:number;inputBytes:Binary;
  state:'PENDING'|'PROCESSING'|'COMPLETED'|'COMPLETED_WITH_ERRORS'|'FAILED';run:1|2;attempt:number;nextAttemptAt:Date;nextDispatchAt:Date;leaseToken:string|null;leaseExpiresAt:Date|null;
  createdAt:Date;updatedAt:Date;startedAt:Date|null;finishedAt:Date|null;lastFailure:{code:string;safeMessage:string;retryable:boolean;occurredAt:Date}|null;result:ValidationResult|null;
  events:{time:Date;run:1|2;attempt:number;reasonCode:string;actor:'owner'|'system'}[];
}
export const REQUIRED_INDEXES=[
  {name:'owner_content_unique',key:{'owner.issuer':1,'owner.subject':1,schemaVersion:1,contentHash:1},unique:true},
  {name:'owner_history',key:{'owner.issuer':1,'owner.subject':1,createdAt:-1,_id:-1}},
  {name:'pending_dispatch',key:{state:1,nextDispatchAt:1,_id:1,nextAttemptAt:1}},
  {name:'expired_leases',key:{state:1,leaseExpiresAt:1}},
] as const;
const ownerFilter=(identity:Identity)=>({'owner.issuer':identity.issuer,'owner.subject':identity.subject});
export function summary(doc:ImportDoc) {
  return {id:doc._id,filename:doc.filename,byteSize:doc.byteSize,state:doc.state,run:doc.run,attempt:doc.attempt,createdAt:doc.createdAt.toISOString(),updatedAt:doc.updatedAt.toISOString(),counts:doc.result?{totalRows:doc.result.totalRows,validCount:doc.result.validCount,rejectedCount:doc.result.rejectedCount}:null,canRetry:doc.state==='FAILED'&&doc.run===1&&doc.lastFailure?.retryable===true};
}
export function detail(doc:ImportDoc) {
  return {...summary(doc),startedAt:doc.startedAt,finishedAt:doc.finishedAt,nextAttemptAt:doc.nextAttemptAt.toISOString(),lastFailure:doc.lastFailure?{code:doc.lastFailure.code,safeMessage:doc.lastFailure.safeMessage,retryable:doc.lastFailure.retryable,occurredAt:doc.lastFailure.occurredAt.toISOString()}:null,
    events:doc.events.map(event=>({time:event.time.toISOString(),run:event.run,attempt:event.attempt,reasonCode:event.reasonCode,actor:event.actor}))};
}
export const validId=(id:string):boolean=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(id);
export function pagination(query:Record<string,unknown>):{limit:number;after:{time:Date;id:string}|null} {
  if(Object.keys(query).some(k=>!['limit','cursor'].includes(k)))throw new ApiError(400,'INVALID_QUERY','Invalid pagination.');
  const raw=query.limit??'20';if(typeof raw!=='string'||!/^\d{1,2}$/u.test(raw))throw new ApiError(400,'INVALID_QUERY','Invalid pagination.');
  const limit=Number(raw);if(limit<1||limit>50)throw new ApiError(400,'INVALID_QUERY','Invalid pagination.');
  if(query.cursor===undefined)return{limit,after:null};
  try {
    if(typeof query.cursor!=='string'||query.cursor.length>256||!/^[A-Za-z0-9_-]+$/u.test(query.cursor))throw new Error();
    const decoded:unknown=JSON.parse(Buffer.from(query.cursor,'base64url').toString('utf8'));
    if(!Array.isArray(decoded)||decoded.length!==2||typeof decoded[0]!=='string'||typeof decoded[1]!=='string'||!validId(decoded[1]))throw new Error();
    const time=new Date(decoded[0]);if(time.toISOString()!==decoded[0])throw new Error();
    return {limit,after:{time,id:decoded[1]}};
  }catch{throw new ApiError(400,'INVALID_QUERY','Invalid pagination.');}
}
export class ImportStore {
  readonly client:MongoClient; readonly collection:Collection<ImportDoc>;
  constructor(config:Config){this.client=new MongoClient(config.mongoUri,{serverSelectionTimeoutMS:3000,connectTimeoutMS:3000,socketTimeoutMS:5000,writeConcern:{w:'majority',journal:true,wtimeoutMS:5000}});this.collection=this.client.db(config.database).collection<ImportDoc>('imports');}
  async connect():Promise<void>{
    await this.client.connect();
    for(const index of REQUIRED_INDEXES)await this.collection.createIndex(index.key,{name:index.name,...('unique'in index?{unique:true}:{})});
    const actual=await this.collection.listIndexes().toArray();
    for(const expected of REQUIRED_INDEXES){const found=actual.find(i=>i.name===expected.name);if(!found||JSON.stringify(found.key)!==JSON.stringify(expected.key)||('unique'in expected&&!found.unique))throw new Error('Required database index mismatch');}
  }
  async close():Promise<void>{await this.client.close();}
  async ping():Promise<void>{await this.client.db().command({ping:1});}
  private async database<T>(action:()=>Promise<T>):Promise<T>{try{return await action();}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(503,'DATABASE_UNAVAILABLE','Storage is temporarily unavailable. Retry the same request.');}}
  async create(identity:Identity,filename:string,bytes:Buffer):Promise<{doc:ImportDoc;duplicate:boolean}>{
    return this.database(async()=>{
      const hash=createHash('sha256').update(bytes).digest('hex');
      const filter={...ownerFilter(identity),schemaVersion:'shipment-v1' as const,contentHash:hash};
      // $literal prevents CSV/filename strings from being interpreted as pipeline expressions.
      const initial={_id:randomUUID(),owner:{issuer:identity.issuer,subject:identity.subject},schemaVersion:'shipment-v1',contentHash:hash,filename,byteSize:bytes.length,inputBytes:new Binary(bytes),state:'PENDING',run:1,attempt:0,leaseToken:null,leaseExpiresAt:null,startedAt:null,finishedAt:null,lastFailure:null,result:null};
      let duplicate=false;
      try {
        const write=await this.collection.updateOne(filter,[{$replaceWith:{$cond:[{$eq:[{$type:'$createdAt'},'missing']},{$mergeObjects:[{$literal:initial},{createdAt:'$$NOW',updatedAt:'$$NOW',nextAttemptAt:'$$NOW',nextDispatchAt:'$$NOW',events:[{time:'$$NOW',run:1,attempt:0,reasonCode:'ACCEPTED',actor:'owner'}]}]},'$$ROOT']}}],{upsert:true});
        duplicate=write.upsertedCount===0;
      }catch(error){if(error instanceof MongoServerError&&error.code===11000)duplicate=true;else throw error;}
      const doc=await this.collection.findOne(filter);
      if(!doc)throw new Error('Missing acknowledged import');return{doc,duplicate};
    });
  }
  async get(identity:Identity,id:string):Promise<ImportDoc>{
    if(!validId(id))throw new ApiError(404,'NOT_FOUND','Resource not found.');
    return this.database(async()=>{const doc=await this.collection.findOne({_id:id,...ownerFilter(identity)});if(!doc)throw new ApiError(404,'NOT_FOUND','Resource not found.');return doc;});
  }
  async retry(identity:Identity,id:string):Promise<{doc:ImportDoc;duplicate:boolean}>{
    await this.get(identity,id);
    return this.database(async()=>{
      const doc=await this.collection.findOneAndUpdate({_id:id,...ownerFilter(identity),state:'FAILED',run:1,'lastFailure.retryable':true},[{$set:{
        state:'PENDING',run:2,attempt:0,nextAttemptAt:'$$NOW',nextDispatchAt:'$$NOW',updatedAt:'$$NOW',startedAt:null,finishedAt:null,lastFailure:null,result:null,leaseToken:null,leaseExpiresAt:null,
        events:{$slice:[{$concatArrays:['$events',[{time:'$$NOW',run:2,attempt:0,reasonCode:'MANUAL_RETRY',actor:'owner'}]]},-32]}
      }}],{returnDocument:'after'});
      if(doc)return{doc,duplicate:false};
      const current=await this.get(identity,id);
      if(current.run===2)return{doc:current,duplicate:true};
      throw new ApiError(409,'RETRY_NOT_ALLOWED','This import cannot be retried.');
    });
  }
  async list(identity:Identity,query:Record<string,unknown>){
    const {limit,after}=pagination(query);
    return this.database(async()=>{
      const filter:Filter<ImportDoc>={...ownerFilter(identity)};
      if(after)filter.$or=[{createdAt:{$lt:after.time}},{createdAt:after.time,_id:{$lt:after.id}}];
      const docs=await this.collection.find(filter,{projection:{inputBytes:0,leaseToken:0,'result.acceptedRows':0,'result.rejectedRows':0}}).sort({createdAt:-1,_id:-1}).limit(limit+1).toArray();
      const items=docs.slice(0,limit),last=items.at(-1);
      return {items:items.map(summary),nextCursor:docs.length>limit&&last?Buffer.from(JSON.stringify([last.createdAt.toISOString(),last._id])).toString('base64url'):null};
    });
  }
}
