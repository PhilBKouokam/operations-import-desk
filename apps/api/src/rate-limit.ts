import { ApiError } from './errors.js';
export class UploadLimiter {
  private buckets=new Map<string,{count:number;expires:number}>();
  constructor(private now:()=>number=Date.now){}
  consume(subject:string,ip:string):void {
    const now=this.now();for(const [key,value]of this.buckets)if(value.expires<=now)this.buckets.delete(key);
    const keys=[`subject:${subject}`,`ip:${ip}`];
    if(this.buckets.size+keys.filter(k=>!this.buckets.has(k)).length>10000)throw new ApiError(429,'RATE_LIMITED','Upload capacity reached. Try again later.');
    for(const key of keys)if((this.buckets.get(key)?.count??0)>=10)throw new ApiError(429,'RATE_LIMITED','Upload limit reached. Try again in one minute.');
    for(const key of keys){const bucket=this.buckets.get(key)??{count:0,expires:now+60000};bucket.count++;this.buckets.set(key,bucket);}
  }
}
