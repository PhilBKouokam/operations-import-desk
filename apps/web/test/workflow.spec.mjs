import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFile} from 'node:fs/promises';
import {ImportStore} from '../../../dist/apps/api/src/store.js';
import {ProcessingState,ProcessingFailure} from '../../../dist/apps/worker/src/state.js';
import {processNotice} from '../../../dist/apps/worker/src/processor.js';
const issuer=process.env.OIDC_ISSUER;
if(!issuer||!process.env.M4_WORKER_PID||process.env.MONGO_DATABASE!=='odi_m4_browser')throw new Error('Use the isolated real-service browser harness. No mock fallback.');
const store=new ImportStore({mongoUri:process.env.MONGO_URI,database:process.env.MONGO_DATABASE,issuer,audience:'odi-api',roleClient:'odi-api',uiOrigin:'http://127.0.0.1:5173',port:0});
const state=new ProcessingState(store),worker=Number(process.env.M4_WORKER_PID);
const header='shipment_id,origin_code,destination_code,scheduled_date,weight_kg,carrier_code\n';
const valid=header+'SHIP-1,HOU,AUS,2026-09-29,12.25,ACME\n';
const silent=()=>{};
function pause(){process.kill(worker,'SIGSTOP');}
function resume(){process.kill(worker,'SIGCONT');}
async function login(page,user='operator-a',path='/imports'){
  const me=page.waitForResponse(r=>r.url().endsWith('/v1/me')&&r.status()===200);
  await page.goto(path);await page.locator('#username').fill(user);await page.locator('#password').fill('Local-demo-only-123!');await page.locator('#kc-login').click();
  const profile=await(await me).json();await expect(page.getByRole('navigation')).toBeVisible();return{issuer,subject:profile.subject,role:profile.role};
}
async function upload(page,name,bytes){await page.getByRole('link',{name:'Submit',exact:true}).click();await page.getByLabel('Shipment CSV',{exact:true}).setInputFiles({name,mimeType:'text/csv',buffer:Buffer.from(bytes)});await page.getByRole('button',{name:'Submit import',exact:true}).click();await expect(page.getByRole('link',{name:'View import details'})).toBeVisible();const href=await page.getByRole('link',{name:'View import details'}).getAttribute('href');return href.split('/').at(-1);}
async function details(page){await page.getByRole('link',{name:'View import details'}).click();await expect(page.getByRole('heading',{name:'Processing status'})).toBeVisible();}
async function fixture(identity,name,mode='completed',bytes=valid){const doc=(await store.create(identity,name,Buffer.from(bytes))).doc;
  if(mode==='completed')await processNotice(state,{importId:doc._id,run:doc.run},silent);
  if(mode==='failed'||mode==='nonretryable'){for(let i=0;i<(mode==='failed'?3:1);i++){await store.collection.updateOne({_id:doc._id},{$set:{nextAttemptAt:new Date(0)}});const claimed=await state.claim({importId:doc._id,run:1});await state.fail(claimed,new ProcessingFailure(mode==='failed'?'TRANSIENT_DEPENDENCY':'INTERNAL_PROCESSING',mode==='failed'));}}
  return doc;
}
async function tabTo(page,target){for(let i=0;i<40;i++){if(await target.evaluate(el=>el===document.activeElement))return;await page.keyboard.press('Tab');}throw new Error('Keyboard target not reachable');}
async function axe(page){const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(results.violations).toEqual([]);}
async function exportText(page,name){const promise=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();return await readFile(await(await promise).path(),'utf8');}
test.beforeAll(async()=>{await store.connect();});
test.beforeEach(async()=>{resume();await store.collection.deleteMany({});});
test.afterEach(async()=>{resume();});
test.afterAll(async()=>{await store.close();});
test('A17 operator: keyboard Submit → Details → History, durable acceptance and completion, refresh, token storage',async({page})=>{
  const authRequests=[];page.on('request',r=>{if(r.url().includes('/protocol/openid-connect/auth'))authRequests.push(new URL(r.url()));});
  await login(page);await expect(page.getByRole('heading',{name:'No imports yet'})).toBeVisible();await axe(page);
  const submitLink=page.getByRole('link',{name:'Submit',exact:true});await tabTo(page,submitLink);await expect(submitLink).toBeFocused();expect(await submitLink.evaluate(el=>getComputedStyle(el).outlineWidth)).toBe('3px');await page.keyboard.press('Enter');await expect(page.getByRole('heading',{name:'Submit an import'})).toBeFocused();await axe(page);
  await page.bringToFront();const input=page.getByLabel('Shipment CSV',{exact:true});await tabTo(page,input);const chooser=page.waitForEvent('filechooser');await page.keyboard.press('Space');await(await chooser).setFiles({name:'keyboard.csv',mimeType:'text/csv',buffer:Buffer.from(valid)});
  pause();const button=page.getByRole('button',{name:'Submit import',exact:true});await tabTo(page,button);await page.keyboard.press('Enter');await expect(page.getByRole('heading',{name:'File saved'})).toBeVisible();await expect(page.getByText('Waiting for processing',{exact:true})).toBeVisible();
  const view=page.getByRole('link',{name:'View import details'});await tabTo(page,view);await page.keyboard.press('Enter');await expect(page.getByText('Saved; waiting for processing.')).toBeVisible();const url=page.url();resume();await expect(page.getByText('All rows passed validation.',{exact:false})).toBeVisible({timeout:45000});await axe(page);
  await page.screenshot({path:'docs/test-output/m4-details.png',fullPage:true});
  const stored=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}));for(const data of Object.values(stored))for(const value of Object.values(data))expect(value).not.toMatch(/eyJ[A-Za-z0-9_-]+\.eyJ/);expect(Object.keys(stored.session)).not.toContain('odi.returnPath');
  expect(authRequests.some(u=>u.searchParams.get('response_type')==='code'&&u.searchParams.get('code_challenge_method')==='S256'&&Boolean(u.searchParams.get('state'))&&Boolean(u.searchParams.get('nonce')))).toBe(true);
  await page.reload();await expect(page.getByText('All rows passed validation.',{exact:false})).toBeVisible();expect(page.url()).toBe(url);
  await tabTo(page,page.getByRole('link',{name:'← Import History'}));await page.keyboard.press('Enter');await expect(page.getByRole('heading',{name:'Import History',exact:true})).toBeFocused();await expect(page.getByRole('link',{name:'keyboard.csv'})).toBeVisible();await tabTo(page,page.getByRole('link',{name:'keyboard.csv'}));await page.keyboard.press('Enter');await expect(page.getByText('1 accepted',{exact:false})).toHaveCount(0);await expect(page.getByText('All rows passed validation.',{exact:false})).toBeVisible();
});
test('A17 mixed/invalid rows, literal malicious text, protected safe CSV downloads and duplicate upload',async({page})=>{
  await login(page);const payload='<img src=x onerror="document.body.dataset.injected=1">';const mixed=header+'GOOD,HOU,AUS,2026-09-29,1,ACME\n'+`"${payload.replaceAll('"','""')}",HOU,HOU,no,-1,ACME\n`+'=SUM(A1),HOU,AUS,2026-09-29,1,ACME\n';
  const id=await upload(page,'mixed.csv',mixed);await details(page);await expect(page.getByRole('heading',{name:'Rows to correct'})).toBeVisible({timeout:45000});await expect(page.getByText(payload,{exact:true})).toBeVisible();expect(await page.locator('main img').count()).toBe(0);expect(await page.locator('body').getAttribute('data-injected')).toBeNull();await expect(page.getByText('Destination must differ from origin.',{exact:false})).toBeVisible();await axe(page);await page.screenshot({path:'docs/test-output/m4-rejections.png',fullPage:true});
  const errors=await exportText(page,'Download error CSV');expect(errors).toContain('"\'=SUM(A1)"');const accepted=await exportText(page,'Download accepted CSV');expect(accepted).toContain('"GOOD"');expect(accepted).not.toContain('SUM');
  const same=await upload(page,'renamed.csv',mixed);expect(same).toBe(id);await expect(page.getByRole('heading',{name:'Existing import found'})).toBeVisible();await expect(page.getByText('No new import was created.',{exact:false})).toBeVisible();
  await upload(page,'all-invalid.csv',header+'bad,HOU,HOU,no,-1,a\n');await details(page);await expect(page.getByRole('heading',{name:'Rows to correct'})).toBeVisible({timeout:45000});const empty=await exportText(page,'Download accepted CSV');expect(empty.trim().split('\r\n')).toHaveLength(1);await expect(page.getByRole('button',{name:'Retry processing once'})).toHaveCount(0);
});
test('A17 structural validation, accessible error association, loading/unavailable/empty history',async({page})=>{
  await login(page);await page.getByRole('link',{name:'Submit',exact:true}).click();await page.getByLabel('Shipment CSV',{exact:true}).setInputFiles({name:'bad-header.csv',mimeType:'text/csv',buffer:Buffer.from('wrong,header\n1,2\n')});await page.getByRole('button',{name:'Submit import',exact:true}).click();await expect(page.getByRole('alert')).toContainText('exactly six columns');await expect(page.getByLabel('Shipment CSV',{exact:true})).toHaveAttribute('aria-describedby',/upload-error/);expect(await store.collection.countDocuments()).toBe(0);await axe(page);await page.screenshot({path:'docs/test-output/m4-submit.png',fullPage:true});
  await page.route('**/v1/imports?*',async route=>{await new Promise(r=>setTimeout(r,800));await route.abort();});await page.getByRole('link',{name:'Import History',exact:true}).click();await expect(page.getByRole('status')).toContainText('Loading imports');await expect(page.getByRole('alert')).toContainText('Could not reach');await page.unroute('**/v1/imports?*');await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByRole('heading',{name:'No imports yet'})).toBeVisible();
});
test('A17 viewer reads own seed; cannot submit or retry; operator B direct navigation gets real 404',async({browser})=>{
  pause();const a=await browser.newContext(),b=await browser.newContext(),v=await browser.newContext();try{const pa=await a.newPage(),pb=await b.newPage(),pv=await v.newPage();const identityA=await login(pa),identityV=await login(pv,'viewer');const privateDoc=await fixture(identityA,'private-a.csv');const viewerDoc=await fixture(identityV,'viewer-owned.csv','completed',header+'VIEW,HOU,AUS,2026-09-29,1,ACME\n');const viewerFailed=await fixture(identityV,'viewer-failed.csv','failed',header+'FAIL,HOU,AUS,2026-09-29,1,ACME\n');await pv.reload();await expect(pv.getByRole('link',{name:'viewer-owned.csv'})).toBeVisible();await expect(pv.getByRole('link',{name:'private-a.csv'})).toHaveCount(0);await pv.getByRole('link',{name:'viewer-owned.csv'}).click();await expect(pv.getByRole('button',{name:'Download accepted CSV'})).toBeVisible();expect(await exportText(pv,'Download accepted CSV')).toContain('"VIEW"');await pv.goto(`/imports/${viewerFailed._id}`);await expect(pv.getByRole('heading',{name:'Failure summary'})).toBeVisible();await expect(pv.getByRole('button',{name:'Retry processing once'})).toHaveCount(0);await pv.getByRole('link',{name:'Submit',exact:true}).click();await expect(pv.getByText('You have viewer access.',{exact:false})).toBeVisible();await expect(pv.locator('input[type=file]')).toHaveCount(0);await axe(pv);
    await login(pb,'operator-b',`/imports/${privateDoc._id}`);await expect(pb.getByRole('alert')).toContainText('Import not found');await expect(pb.getByRole('heading',{name:'private-a.csv'})).toHaveCount(0);await expect(pb.getByRole('button',{name:'Download accepted CSV'})).toHaveCount(0);expect(viewerDoc._id).not.toBe(privateDoc._id);
  }finally{await a.close();await b.close();await v.close();}
});
test('A17 server-authorized eligible retry only, second run, no retry for nonretryable failure',async({page})=>{
  pause();const identity=await login(page);const failed=await fixture(identity,'retry.csv','failed');await page.goto(`/imports/${failed._id}`);await expect(page.getByRole('button',{name:'Retry processing once'})).toBeVisible();await tabTo(page,page.getByRole('button',{name:'Retry processing once'}));await page.keyboard.press('Enter');await expect(page.getByText('2 of 2',{exact:true})).toBeVisible();await expect(page.getByText('Saved; waiting for processing.')).toBeVisible();await expect(page.getByRole('button',{name:'Retry processing once'})).toHaveCount(0);resume();await expect(page.getByText('All rows passed validation.',{exact:false})).toBeVisible({timeout:45000});
  pause();const fatal=await fixture(identity,'fatal.csv','nonretryable',header+'FATAL,HOU,AUS,2026-09-29,1,ACME\n');await page.goto(`/imports/${fatal._id}`);await expect(page.getByRole('heading',{name:'Failure summary'})).toBeVisible();await expect(page.getByRole('button',{name:'Retry processing once'})).toHaveCount(0);
});
test('A17 actual network failure retains confirmed status; polling stops terminal and after leaving',async({page,context})=>{
  pause();await login(page);await upload(page,'poll.csv',valid);await details(page);let count=0;page.on('request',r=>{if(/\/v1\/imports\/[0-9a-f-]+$/u.test(r.url()))count++;});await expect.poll(()=>count,{timeout:8000}).toBeGreaterThan(0);
  await context.setOffline(true);await expect(page.getByRole('alert')).toContainText('Status unavailable; last updated',{timeout:20000});await expect(page.getByText('Saved; waiting for processing.')).toBeVisible();await context.setOffline(false);await page.getByRole('button',{name:'Refresh status',exact:true}).first().click();await expect(page.getByRole('alert')).toHaveCount(0);
  resume();await expect(page.getByText('All rows passed validation.',{exact:false})).toBeVisible({timeout:45000});const terminal=count;await page.waitForTimeout(6500);expect(count).toBe(terminal);
  await page.getByRole('link',{name:'← Import History'}).click();const left=count;await page.waitForTimeout(3500);expect(count).toBe(left);
});
test('A17 history cursor pages are stable, newest first, with semantic tables',async({page})=>{
  pause();const identity=await login(page);for(let i=0;i<21;i++)await fixture(identity,`history-${String(i).padStart(2,'0')}.csv`,'completed',header+`S${i},HOU,AUS,2026-09-29,1,ACME\n`);await page.reload();await expect(page.getByRole('link',{name:'history-20.csv'})).toBeVisible();await expect(page.locator('tbody tr')).toHaveCount(20);await expect(page.locator('tbody tr').first()).toContainText('history-20.csv');await expect(page.locator('tbody tr').first()).toContainText('1 accepted · 0 rejected');await axe(page);await page.screenshot({path:'docs/test-output/m4-history.png',fullPage:true});await page.getByRole('button',{name:'Next page'}).click();await expect(page.locator('tbody tr')).toHaveCount(1);await expect(page.getByRole('link',{name:'history-00.csv'})).toBeVisible();await page.getByRole('button',{name:'Previous page'}).click();await expect(page.locator('tbody tr')).toHaveCount(20);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await axe(page);
});
test('A17 controlled visibility signal: hidden document stops requests; visible document resumes 3-second polling',async({page})=>{
  pause();await login(page);await upload(page,'visibility.csv',valid);await details(page);
  const starts=[];page.on('request',r=>{if(/\/v1\/imports\/[0-9a-f-]+$/u.test(r.url()))starts.push(Date.now());});await expect.poll(()=>starts.length,{timeout:11000}).toBeGreaterThanOrEqual(2);expect(starts[1]-starts[0]).toBeGreaterThanOrEqual(2900);
  // This headless Chromium distribution reports even background tabs as visible.
  // Inject only the DOM visibility signal; API, tokens, storage and transport remain real.
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});const hiddenCount=starts.length;await page.waitForTimeout(6500);expect(starts.length).toBe(hiddenCount);
  await page.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});await expect.poll(()=>starts.length).toBeGreaterThan(hiddenCount);
});
test('OIDC browser: adapter refreshes access token; no-role account is denied by real API',async({page,browser})=>{
  await login(page);let refreshes=0;page.on('request',r=>{if(r.url().endsWith('/protocol/openid-connect/token')&&new URLSearchParams(r.postData()??'').get('grant_type')==='refresh_token')refreshes++;});
  await page.clock.install();await page.clock.fastForward(301000);await page.getByRole('link',{name:'Submit',exact:true}).click();await page.getByRole('link',{name:'Import History',exact:true}).click();await expect(page.getByRole('heading',{name:'No imports yet'})).toBeVisible();expect(refreshes).toBeGreaterThan(0);
  const context=await browser.newContext();try{const denied=await context.newPage();await denied.goto('/imports');await denied.locator('#username').fill('no-role');await denied.locator('#password').fill('Local-demo-only-123!');await denied.locator('#kc-login').click();await expect(denied.getByRole('alert')).toContainText('not allowed');await expect(denied.getByRole('navigation')).toHaveCount(0);}finally{await context.close();}
});
