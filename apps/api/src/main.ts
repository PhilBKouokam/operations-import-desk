import { createApp } from './app.js';
import { loadConfig } from './config.js';
try {
  const config=loadConfig();const {app,store}=await createApp(config);
  await app.listen(config.port,'127.0.0.1');
  console.log(JSON.stringify({event:'api_started',port:config.port}));
  let stopping=false;
  const stop=async():Promise<void>=>{if(stopping)return;stopping=true;await app.close();await store.close();};
  process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());
}catch{console.error(JSON.stringify({event:'startup_failed',message:'Check required configuration, database indexes, and OIDC discovery.'}));process.exitCode=1;}
