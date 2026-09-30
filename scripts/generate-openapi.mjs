// Documentation-only generator. Explicit public schemas; route coverage checked against Nest decorators.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
const str={type:'string'},integer={type:'integer'},bool={type:'boolean'},date={type:'string',format:'date-time'};
const nullable=s=>({anyOf:[s,{type:'null'}]});
const object=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const ref=name=>({$ref:`#/components/schemas/${name}`});
const array=items=>({type:'array',items});
const summary=object({id:{type:'string',format:'uuid'},filename:str,byteSize:{type:'integer',maximum:262144},state:{type:'string',enum:['PENDING','PROCESSING','COMPLETED','COMPLETED_WITH_ERRORS','FAILED']},run:{type:'integer',enum:[1,2]},attempt:{type:'integer',minimum:0,maximum:3},createdAt:date,updatedAt:date,counts:nullable(object({totalRows:integer,validCount:integer,rejectedCount:integer})),canRetry:bool});
const schemas={
 Error:object({error:object({code:str,message:str,requestId:{type:'string',format:'uuid'}})}),
 Me:object({subject:str,role:{type:'string',enum:['operator','viewer']}}),
 Summary:summary,
 Detail:object({...summary.properties,startedAt:nullable(date),finishedAt:nullable(date),nextAttemptAt:date,lastFailure:nullable(object({code:str,safeMessage:str,retryable:bool,occurredAt:date})),events:array(object({time:date,run:integer,attempt:integer,reasonCode:str,actor:{type:'string',enum:['owner','system']}}))}),
 Acceptance:object({import:ref('Summary'),duplicate:bool}),
 History:object({items:array(ref('Summary')),nextCursor:nullable(str)}),
 Rejections:object({items:array(object({recordNumber:integer,values:object(Object.fromEntries(['shipment_id','origin_code','destination_code','scheduled_date','weight_kg','carrier_code'].map(k=>[k,str]))),errors:array(object({field:str,code:str,message:str}))})),total:integer,nextOffset:nullable(integer)}),
 Health:object({status:{const:'ok',type:'string'}})
};
const response=(description,schema)=>({description,headers:{'X-Request-Id':{schema:{type:'string',format:'uuid'},description:'Server-generated correlation identifier'}},content:{'application/json':{schema}}});
const err=code=>response({400:'Malformed request / input structure',401:'Missing or invalid API access token',403:'Required role absent',404:'Not found (including another owner)',409:'State does not permit operation',413:'Upload envelope/file too large',415:'Unsupported content type',429:'Upload rate limit',503:'Dependency unavailable'}[code],ref('Error'));
const query=(name,schema,description)=>({name,in:'query',required:false,schema,description});
const paths={};
function route(path,method,operationId,description,schema,options={}){
 const errors=options.public?[503]:[400,401,403,404,503,...(options.errors??[])];
 paths[path]??={};paths[path][method]={operationId,description,security:options.public?[]:[{apiBearer:[]}],parameters:[...(path.includes('{id}')?[{name:'id',in:'path',required:true,schema:{type:'string',format:'uuid'}}]:[]),...(options.query??[])],...(options.body?{requestBody:options.body}:{}),responses:{...Object.fromEntries(errors.map(c=>[c,err(c)])),200:response('Success',schema),...(options.accepted?{202:response('New durable acceptance; processing may not have started',schema)}:{})}};
}
route('/v1/me','get','me','Current authenticated subject and mapped API client role.',ref('Me'));
route('/v1/imports','post','submitImport','Operator only. Exactly one multipart file, no fields. File <=262144 bytes, envelope <=278528 bytes; UTF-8 shipment-v1 CSV, <=1000 rows, <=128 Unicode code points/cell, <=4096 UTF-8 bytes/record. Structure validated before persistence. Same owner/schema/exact bytes returns 200 duplicate, even after a lost response. Original filename is retained.',ref('Acceptance'),{accepted:true,errors:[413,415,429],body:{required:true,content:{'multipart/form-data':{schema:object({file:{type:'string',format:'binary'}})}}}});
route('/v1/imports','get','listImports','Owner-scoped newest-first (createdAt,id descending). Opaque cursor.',ref('History'),{query:[query('limit',{type:'integer',minimum:1,maximum:50,default:20},'Page size'),query('cursor',str,'Opaque nextCursor from prior page')]});
route('/v1/imports/{id}','get','getImport','Owner-scoped durable detail. canRetry describes state eligibility; caller must also be an operator.',ref('Detail'));
route('/v1/imports/{id}/retry','post','retryImport','Operator/owner only; retryable FAILED run 1 becomes run 2. Repeated expectedRun:1 returns existing run 2 with 200. No run 3.',ref('Summary'),{accepted:true,errors:[409,413],body:{required:true,content:{'application/json':{schema:object({expectedRun:{type:'integer',const:1}})}}}});
route('/v1/imports/{id}/errors','get','getErrors','Owner only. Results exist only in COMPLETED/COMPLETED_WITH_ERRORS; otherwise 409. Values are text, never HTML.',ref('Rejections'),{errors:[409],query:[query('offset',{type:'integer',minimum:0,maximum:9999,default:0},'Rejected-row offset'),query('limit',{type:'integer',minimum:1,maximum:100,default:50},'Rejected rows/page')]});
route('/v1/imports/{id}/download','get','download','Owner only; completed results only. Cells quoted and spreadsheet formula prefixes neutralized. No public result URL.',str,{errors:[409],query:[{...query('kind',{type:'string',enum:['accepted','errors']},'Export kind'),required:true}]});
paths['/v1/imports/{id}/download'].get.responses[200]={description:'Protected CSV attachment',headers:{'Content-Disposition':{schema:str}},content:{'text/csv':{schema:str}}};
route('/health/live','get','live','Process liveness only.',ref('Health'),{public:true});
route('/health/ready','get','ready','MongoDB readiness; does not claim worker or Redis readiness.',ref('Health'),{public:true});
const source=ts.createSourceFile('app.ts',fs.readFileSync('apps/api/src/app.ts','utf8'),ts.ScriptTarget.Latest,true);
const observed=[];
function deco(node,name){return(ts.canHaveDecorators(node)?ts.getDecorators(node)??[]:[]).map(d=>d.expression).find(e=>ts.isCallExpression(e)&&e.expression.getText(source)===name);}
for(const node of source.statements){if(!ts.isClassDeclaration(node))continue;const c=deco(node,'Controller');if(!c)continue;const prefix=c.arguments[0].text;for(const member of node.members){for(const method of ['Get','Post']){const d=deco(member,method);if(d)observed.push(`${method.toLowerCase()} /${prefix}/${d.arguments[0].text.replace(/:([a-z]+)/g,'{$1}')}`);}}}
const documented=Object.entries(paths).flatMap(([path,methods])=>Object.keys(methods).map(method=>`${method} ${path}`));
assert.deepEqual(documented.sort(),observed.sort(),'OpenAPI route inventory differs from Nest controllers');
const spec={openapi:'3.1.0',info:{title:'Operations Import Desk API',version:'1.1.0',description:'Generated from explicit public contract schemas; route inventory checked against Nest source. Not a runtime Swagger endpoint. No internal Mongo fields. Local development server only.'},servers:[{url:'http://127.0.0.1:3000'}],paths,components:{securitySchemes:{apiBearer:{type:'http',scheme:'bearer',bearerFormat:'JWT',description:'OIDC-issued API access token (RS256, exact issuer/audience, Bearer typ, exp/iat/sub). Never an ID token. Browser uses Authorization Code + PKCE S256 with public odi-web client.'}},schemas}};
const output=JSON.stringify(spec,null,2)+'\n',target='docs/openapi.json';
if(process.argv.includes('--check'))assert.equal(fs.readFileSync(target,'utf8'),output,'Regenerate with npm run docs:openapi');else fs.writeFileSync(target,output);
console.log(`OpenAPI ${process.argv.includes('--check')?'verified':'generated'}: ${observed.length} routes; explicit public schemas.`);
