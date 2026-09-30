import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell } from '../../api/src/results.js';
import { notificationId, ProcessingFailure } from '../src/state.js';
import { classify } from '../src/processor.js';
import { InputError, parseShipmentCsv, validateShipments, validationSteps } from '../../../packages/input/src/index.js';
test('A16 CSV quotes all cells and neutralizes active prefixes without mutating input',()=>{
  for(const raw of ['=1+1',' +SUM(A1)','-1','@cmd','\ttext','  \rtext','\u2003=2'])assert.equal(csvCell(raw),'"\''+raw+'"');
  assert.equal(csvCell('plain "quoted"'),'"plain ""quoted"""');assert.equal(csvCell('A-B'),'"A-B"');
});
test('Stable notification IDs include run, never dispatch count',()=>{assert.equal(notificationId({importId:'id',run:1}),'import-id-run-1');assert.notEqual(notificationId({importId:'id',run:1}),notificationId({importId:'id',run:2}));});
test('Explicit failure classification does not inspect exception messages',()=>{assert.equal(classify(new Error('network timeout secret')).retryable,false);assert.equal(classify(new InputError('INVALID_CSV')).code,'INVALID_STORED_INPUT');const e=new ProcessingFailure('PROCESSING_DEADLINE',true);assert.equal(classify(e),e);});
test('Chunked validation preserves cross-chunk duplicate detection',()=>{
  const bytes=Buffer.from('shipment_id,origin_code,destination_code,scheduled_date,weight_kg,carrier_code\n'+Array.from({length:201},(_,i)=>`${i===200?'S0':`S${i}`},AA,BB,2026-01-01,1,CC`).join('\n'));
  const parsed=parseShipmentCsv(bytes),steps=validationSteps(parsed);let yields=0;
  for(;;){const step=steps.next();if(step.done){assert.deepEqual(step.value,validateShipments(parsed));assert.equal(step.value.rejectedCount,2);break;}yields++;}assert.equal(yields,3);
});
