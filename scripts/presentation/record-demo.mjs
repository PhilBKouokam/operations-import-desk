// Presentation capture only. Uses real UI, API and services; never alters application code or Mongo state.
import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {ImportStore} from '../../dist/apps/api/src/store.js';
const pid=Number(process.env.M4_WORKER_PID);
if(!pid||process.env.MONGO_DATABASE!=='odi_m4_browser')throw Error('Use the isolated presentation harness.');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
const loginContext=await browser.newContext();const login=await loginContext.newPage();
await login.goto('http://127.0.0.1:5173/imports');await login.locator('#username').fill('operator-a');await login.locator('#password').fill('Local-demo-only-123!');await login.locator('#kc-login').click();await expect(login.getByRole('navigation')).toBeVisible();
const providerSession=await loginContext.storageState();await loginContext.close();
await fs.mkdir('recording-raw',{recursive:true});
const context=await browser.newContext({storageState:providerSession,viewport:{width:1280,height:900},recordVideo:{dir:'recording-raw',size:{width:1280,height:900}}});
const page=await context.newPage(),video=page.video();const rawVideoPath=await video.path();const started=Date.now();
const store=new ImportStore({mongoUri:process.env.MONGO_URI,database:process.env.MONGO_DATABASE});await store.connect();
const observations=[];let paused=false;
const until=async seconds=>{while(Date.now()-started<seconds*1000)await new Promise(r=>setTimeout(r,Math.min(1000,seconds*1000-(Date.now()-started))));};
const card=async(title,body)=>page.setContent(`<html><head><style>body{margin:0;background:#0f172a;color:#f9fafb;font:26px/1.6 system-ui;padding:100px 90px}p{color:#cbd5e1}h1{font-size:48px;line-height:1.2;max-width:1000px}small{color:#93c5fd}li{margin:14px 0}</style></head><body><small>OPERATIONS IMPORT DESK · INDEPENDENT LEARNING DEMO</small><h1>${title}</h1>${body}</body></html>`);
async function submit(name,bytes){await page.goto('http://127.0.0.1:5173/submit');await page.getByLabel('Shipment CSV',{exact:true}).setInputFiles({name,mimeType:'text/csv',buffer:bytes});await page.getByRole('button',{name:'Submit import',exact:true}).click();await expect(page.getByRole('link',{name:'View import details'})).toBeVisible();await page.getByRole('link',{name:'View import details'}).click();return page.url();}
try{
 await card('A shipment file should not disappear when processing is interrupted.','<p>Phillip-Bryan Kouokam · Junior full-stack developer</p><p>First professional engineering role · Synthetic data only</p><p>Inspired by public WebCreek information.<br>Not WebCreek’s systems, clients or architecture.</p>');await until(30);
 await card('Durable state and notification transport','<ul><li>React → NestJS API · Keycloak / OIDC</li><li>MongoDB: accepted input, status, attempts, leases, results</li><li>Redis / BullMQ: import-and-run notifications</li><li>Worker: conditional claim → bounded validation → fenced publication</li></ul><p>256 KiB · 1,000 rows · bounded single-document result</p>');await until(65);
 await page.goto('http://127.0.0.1:5173/submit');await expect(page.getByRole('heading',{name:'Submit an import'})).toBeVisible();await until(73);
 const valid=await fs.readFile('samples/valid.csv');const normal=await submit('valid.csv',valid);await expect(page.getByText('All rows passed validation.',{exact:false})).toBeVisible({timeout:45000});await until(96);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download accepted CSV'}).click();await download;
 await page.getByRole('link',{name:'← Import History'}).click();await until(105);await page.getByRole('link',{name:'valid.csv',exact:true}).click();await page.reload();await until(115);
 await submit('invalid-rows.csv',await fs.readFile('samples/invalid-rows.csv'));await expect(page.getByRole('heading',{name:'Rows to correct'})).toBeVisible({timeout:45000});await until(130);await page.getByRole('heading',{name:'Rows to correct'}).evaluate(el=>el.scrollIntoView({block:'start'}));await until(148);await page.getByRole('button',{name:'Download error CSV'}).scrollIntoViewIfNeeded();const errors=page.waitForEvent('download');await page.getByRole('button',{name:'Download error CSV'}).click();await errors;await until(155);
 process.kill(pid,'SIGSTOP');paused=true;
 await card('Controlled demonstration: local worker paused','<p>Real process pause (SIGSTOP). API, MongoDB and Redis stay available.</p><p>No fabricated status. No database edits.<br>Next: submit another synthetic file while the worker cannot consume.</p>');await until(167);
 const url=await submit('recovery.csv',Buffer.from(valid.toString().replaceAll('SHP','REC')));const id=url.split('/').at(-1);await expect(page.getByText('Saved; waiting for processing.')).toBeVisible();const pending=await store.collection.findOne({_id:id});if(pending.state!=='PENDING'||pending.attempt!==0)throw Error('Expected actual durable pending without claim');observations.push({event:'worker_paused',importId:id,state:pending.state,attempt:pending.attempt});await until(183);
 await page.getByRole('link',{name:'← Import History'}).click();await until(190);await page.getByRole('link',{name:'recovery.csv',exact:true}).click();await until(201);
 process.kill(pid,'SIGCONT');paused=false;
 await expect(page.getByText('All rows passed validation.',{exact:false})).toBeVisible({timeout:45000});const completed=await store.collection.findOne({_id:id});if(completed.attempt!==1)throw Error('Unexpected attempt');observations.push({event:'worker_resumed',importId:id,state:completed.state,attempt:completed.attempt});await until(235);
 await card('What I learned — and what I would ask seniors','<ul><li>Lease / fencing: appropriate, or simpler team pattern?</li><li>OIDC and owner boundaries: placed correctly?</li><li>Where did I overengineer?</li></ul><p>AI assistance disclosed. Docker startup: OPEN / UNPASSED.<br>Hosted CI and public application deployment not claimed.</p>');await until(275);
 await fs.writeFile('docs/presentation/recording-evidence.json',JSON.stringify({kind:'real browser capture; silent video; captions added in export',normalImportUrl:normal.replace('http://127.0.0.1:5173',''),observations,durationTargetSeconds:275,limitations:'Consumer pause/resume only. Does not demonstrate killed-worker lease recovery. No database state mutation. No voice recording.'},null,2)+'\n');
 await page.screenshot({path:'recording-raw/end-card.png'});
}finally{if(paused)process.kill(pid,'SIGCONT');await page.close();await store.close();await context.close();await browser.close();}
await fs.copyFile(rawVideoPath,'recording-raw/walkthrough.webm');console.log('Recorded real walkthrough: recording-raw/walkthrough.webm');
