import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { InputError } from '../../../packages/input/src/index.js';
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
export type ApiRequest = Request & { requestId: string };
@Catch()
export class SafeErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const req=host.switchToHttp().getRequest<ApiRequest>(), res=host.switchToHttp().getResponse<Response>();
    if (res.headersSent) { res.end(); return; }
    let status=500,code='INTERNAL_ERROR',message='The request could not be completed.';
    if(error instanceof ApiError) { status=error.status;code=error.code;message=error.message; }
    else if(error instanceof InputError) {status=error.code==='FILE_TOO_LARGE'?413:422;code=error.code;message='The CSV does not meet the required structure.';}
    else if(error instanceof HttpException) {status=error.getStatus();code=status===404?'NOT_FOUND':'INVALID_REQUEST';message=status===404?'Resource not found.':'Invalid request.';}
    if(status===401) res.setHeader('WWW-Authenticate','Bearer');
    res.status(status).json({error:{code,message,requestId:req.requestId}});
  }
}
