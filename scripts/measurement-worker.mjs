// Test-only real consumer process; no application route or production fault hooks.
import {ImportStore} from '../dist/apps/api/src/store.js';
import {ProcessingState} from '../dist/apps/worker/src/state.js';
import {startConsumer} from '../dist/apps/worker/src/transport.js';
const store=new ImportStore({mongoUri:process.env.MEASURE_MONGO_URI,database:process.env.MEASURE_DATABASE});
await store.connect();
let peak=process.memoryUsage().rss;
const sample=()=>{peak=Math.max(peak,process.memoryUsage().rss);};
const timer=setInterval(sample,10);
const consumer=startConsumer(new ProcessingState(store),process.env.MEASURE_REDIS_URL,()=>{});
await consumer.worker.waitUntilReady();
process.send({ready:true});
process.on('message',async message=>{if(message==='stop'){await consumer.close();clearInterval(timer);sample();await store.close();process.send({peakRssBytes:peak});process.disconnect();}});
