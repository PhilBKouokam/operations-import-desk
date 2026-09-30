import 'reflect-metadata';
import { Controller, Get, Post, Param, Req, Res, Module, UseGuards } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import helmet from 'helmet';
import type { Config } from './config.js';
import { IdentityGuard, TokenVerifier, requireOperator } from './auth.js';
import type { AuthRequest } from './auth.js';
import { ImportStore, summary, detail } from './store.js';
import { ApiError, SafeErrors } from './errors.js';
import type { ApiRequest } from './errors.js';
import { exportCsv, errorPage } from './results.js';
import { readRetry } from './retry-body.js';
import { readUpload } from './upload.js';
import { UploadLimiter } from './rate-limit.js';
@Controller('v1')
@UseGuards(IdentityGuard)
class ImportsController {
  constructor(private readonly store:ImportStore,private readonly limiter:UploadLimiter){}
  @Get('me') me(@Req()req:AuthRequest){return {subject:req.identity.subject,role:req.identity.role};}
  @Post('imports') async create(@Req()req:AuthRequest,@Res()res:Response):Promise<void>{
    requireOperator(req.identity);this.limiter.consume(JSON.stringify([req.identity.issuer,req.identity.subject]),req.socket.remoteAddress??'unknown');
    if(Object.keys(req.query).length)throw new ApiError(400,'INVALID_QUERY','Upload query parameters are not supported.');
    const file=await readUpload(req);const {doc,duplicate}=await this.store.create(req.identity,file.filename,file.bytes);
    res.location(`/v1/imports/${doc._id}`).status(duplicate?200:202).json({import:summary(doc),duplicate});
  }
  @Get('imports') list(@Req()req:AuthRequest){return this.store.list(req.identity,req.query);}
  @Post('imports/:id/retry') async retry(@Req()req:AuthRequest,@Param('id')id:string,@Res()res:Response){
    requireOperator(req.identity);await readRetry(req);const {doc,duplicate}=await this.store.retry(req.identity,id);res.status(duplicate?200:202).json(summary(doc));
  }
  @Get('imports/:id/errors') async errors(@Req()req:AuthRequest,@Param('id')id:string){return errorPage(await this.store.get(req.identity,id),req.query);}
  @Get('imports/:id/download') async download(@Req()req:AuthRequest,@Param('id')id:string,@Res()res:Response){
    const doc=await this.store.get(req.identity,id);
    if(Object.keys(req.query).length!==1||typeof req.query.kind!=='string'||!['accepted','errors'].includes(req.query.kind))throw new ApiError(400,'INVALID_QUERY','Choose an export kind.');
    const csv=exportCsv(doc,req.query.kind as 'accepted'|'errors');
    res.setHeader('Content-Disposition',`attachment; filename="import-${id}-${req.query.kind}.csv"`);res.type('text/csv; charset=utf-8').send(csv);
  }
  @Get('imports/:id') async get(@Req()req:AuthRequest,@Param('id')id:string){
    if(Object.keys(req.query).length)throw new ApiError(400,'INVALID_QUERY','Detail query parameters are not supported.');
    return detail(await this.store.get(req.identity,id));
  }
}
@Controller('health')
class HealthController {
  constructor(private readonly store:ImportStore){}
  @Get('live') live(){return{status:'ok'};}
  @Get('ready') async ready(){try{await this.store.ping();return{status:'ok'};}catch{throw new ApiError(503,'NOT_READY','Service is not ready.');}}
}
export async function createApp(config:Config):Promise<{app:NestExpressApplication;store:ImportStore}>{
  const store=new ImportStore(config);
  try {
    await store.connect();const verifier=await TokenVerifier.create(config);
    @Module({controllers:[ImportsController,HealthController],providers:[{provide:ImportStore,useValue:store},{provide:TokenVerifier,useValue:verifier},{provide:UploadLimiter,useFactory:()=>new UploadLimiter()},IdentityGuard]})
    class AppModule{}
    const app=await NestFactory.create<NestExpressApplication>(AppModule,{bodyParser:false,logger:false,abortOnError:false});
    app.getHttpAdapter().getInstance().disable('x-powered-by');
    app.use((req:Request,res:Response,next:NextFunction)=>{(req as ApiRequest).requestId=randomUUID();res.setHeader('X-Request-Id',(req as ApiRequest).requestId);res.setHeader('Cache-Control','no-store');next();});
    app.use(helmet());
    app.enableCors({origin:config.uiOrigin,methods:['GET','POST','OPTIONS'],allowedHeaders:['Authorization','Content-Type'],exposedHeaders:['Location','X-Request-Id'],credentials:false});
    app.useGlobalFilters(new SafeErrors());await app.init();
    const server=app.getHttpServer();server.requestTimeout=15000;server.headersTimeout=10000;
    return {app,store};
  }catch(error){await store.close();throw error;}
}
