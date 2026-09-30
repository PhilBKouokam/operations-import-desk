import { createServer } from 'node:http';
import { loadConfig } from '../../api/src/config.js';
import { ImportStore } from '../../api/src/store.js';
import { PROCESSING, ProcessingState } from './state.js';
import { Transport, dispatchScan, startConsumer } from './transport.js';
import { structuredLog } from './processor.js';
const config=loadConfig(),url=process.env.REDIS_URL;
if(!url)throw new Error('Missing REDIS_URL');
const parsed=new URL(url);if(!['redis:','rediss:'].includes(parsed.protocol))throw new Error('Invalid REDIS_URL');
const store=new ImportStore(config);await store.connect();const state=new ProcessingState(store),transport=new Transport(url),consumer=startConsumer(state,url);
let stopping=false,timer:NodeJS.Timeout|undefined;
async function scan(){
  if(stopping)return;
  try{const count=await state.recover();if(count)structuredLog({event:'leases_recovered'});await dispatchScan(state,transport);}
  catch{structuredLog({event:'scan_dependency_unavailable'});}
  if(!stopping)timer=setTimeout(()=>void scan(),PROCESSING.scanMs);
}
void scan();
const health=createServer(async(req,res)=>{
  if(req.url!=='/health/ready'){res.writeHead(404).end();return;}
  try{await store.ping();await transport.connection.ping();res.writeHead(200).end('ready');}catch{res.writeHead(503).end('unavailable');}
});health.listen(3001,'127.0.0.1');
async function close(){if(stopping)return;stopping=true;if(timer)clearTimeout(timer);health.close();await consumer.close();await transport.close();await store.close();}
process.on('SIGINT',()=>void close());process.on('SIGTERM',()=>void close());
