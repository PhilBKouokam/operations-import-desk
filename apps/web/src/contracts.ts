export type Role='operator'|'viewer';
export type State='PENDING'|'PROCESSING'|'COMPLETED'|'COMPLETED_WITH_ERRORS'|'FAILED';
export interface Summary {id:string;filename:string;byteSize:number;state:State;run:number;attempt:number;createdAt:string;updatedAt:string;counts:null|{totalRows:number;validCount:number;rejectedCount:number};canRetry:boolean}
export interface Detail extends Summary {startedAt:string|null;finishedAt:string|null;nextAttemptAt:string;lastFailure:null|{code:string;safeMessage:string;retryable:boolean;occurredAt:string};events:{time:string;run:number;attempt:number;reasonCode:string;actor:'owner'|'system'}[]}
export interface Rejected {recordNumber:number;values:Record<string,string>;errors:{field:string;code:string;message:string}[]}
export interface ErrorPage {items:Rejected[];total:number;nextOffset:number|null}
export const unfinished=(state:State)=>state==='PENDING'||state==='PROCESSING';
export const complete=(state:State)=>state==='COMPLETED'||state==='COMPLETED_WITH_ERRORS';
export const stateLabel:Record<State,string>={PENDING:'Waiting for processing',PROCESSING:'Processing',COMPLETED:'Completed',COMPLETED_WITH_ERRORS:'Completed with errors',FAILED:'Failed'};
export function time(value:string|null){return value?new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'medium'}):'Not yet';}
