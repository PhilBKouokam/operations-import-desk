import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COLUMNS, InputError, LIMITS, formatKilograms, parseShipmentCsv, validateShipments } from '../src/index.js';
import type { StructuralCode } from '../src/index.js';

const header = COLUMNS.join(',');
const row = ['SHP1', 'HOU', 'AUS', '2026-10-01', '12.500', 'CAR1'];
const encode = (s: string): Buffer => Buffer.from(s, 'utf8');
const csv = (...lines: string[]): Buffer => encode([header, ...lines].join('\n'));
const check = (bytes: Uint8Array, code: StructuralCode): void => {
  assert.throws(() => parseShipmentCsv(bytes), (error: unknown) => error instanceof InputError && error.code === code);
};
const result = (values: string[]) => validateShipments(parseShipmentCsv(csv(values.join(','))));
const altered = (index: number, value: string): string[] => row.map((v, i) => i === index ? value : v);

test('A04: 1000 records accepted; 1001 rejected', () => {
  assert.equal(parseShipmentCsv(csv(...Array<string>(1000).fill(row.join(',')))).rows.length, 1000);
  check(csv(...Array<string>(1001).fill(row.join(','))), 'TOO_MANY_RECORDS');
});
test('A04: exact 256 KiB file accepted structurally; one byte over rejected', () => {
  const rows = Array.from({length:400}, () => Array<string>(6).fill('A'));
  let remaining = LIMITS.fileBytes - Buffer.byteLength([header, ...rows.map(r=>r.join(','))].join('\n'));
  for (const r of rows) for (let i=0;i<6;i++) {
    const extra = Math.min(remaining,127); r[i] += 'A'.repeat(extra); remaining -= extra;
  }
  assert.equal(remaining,0);
  const bytes = csv(...rows.map(r=>r.join(',')));
  assert.equal(bytes.length,262144);
  assert.equal(parseShipmentCsv(bytes).rows.length,400);
  check(Buffer.concat([bytes,encode('\n')]),'FILE_TOO_LARGE');
});
test('A04: 128 decoded code points accepted; 129 rejected, including astral Unicode', () => {
  for (const symbol of ['A','😀']) {
    const accepted = parseShipmentCsv(csv(altered(0,symbol.repeat(128)).join(',')));
    assert.equal([...accepted.rows[0]!.values.shipment_id].length,128);
    check(csv(altered(0,symbol.repeat(129)).join(',')),'CELL_TOO_LONG');
  }
});
test('A04: 4096-byte record passes byte gate but violates cell limit; 4097 hits byte gate', () => {
  // A valid six-cell record cannot reach 4096 bytes under the tighter cell limits.
  check(csv('A'.repeat(4091)+',,,,,'),'CELL_TOO_LONG');
  check(csv('A'.repeat(4092)+',,,,,'),'RECORD_TOO_LARGE');
});
test('A04: record-byte gate counts UTF-8 bytes', () => {
  check(csv('😀'.repeat(1023)+'AAAA,,,,,'),'RECORD_TOO_LARGE');
});
for (const [name, bytes] of [
  ['truncated multibyte', Buffer.concat([csv(row.join(',')),Buffer.from([0xe2,0x82])])],
  ['illegal continuation', Buffer.from([0x80])],
  ['UTF16 BOM', Buffer.from([0xff,0xfe,0x41,0])],
] as const) test(`A04: invalid UTF-8 ${name}`,()=>check(bytes,'INVALID_UTF8'));
for (const line of ['"SHP1,HOU,AUS,2026-10-01,1,CAR1', 'SH"P1,HOU,AUS,2026-10-01,1,CAR1', '"SHP1"x,HOU,AUS,2026-10-01,1,CAR1']) {
  test(`A04: malformed quoting ${JSON.stringify(line)}`,()=>check(csv(line),'INVALID_CSV'));
}
for (const badHeader of [COLUMNS.toReversed().join(','),header.replace('origin_code','shipment_id'),header.toUpperCase(),` ${header}`]) {
  test(`A04: rejects incorrect header ${badHeader}`,()=>check(encode(`${badHeader}\n${row.join(',')}`),'INVALID_HEADER'));
}
test('A04: missing and extra columns rejected in header and data',()=>{
  for(const h of [COLUMNS.slice(0,5).join(','),header+',extra']) check(encode(`${h}\n${row.join(',')}`),'COLUMN_COUNT');
  for(const r of [row.slice(0,5).join(','),row.join(',')+',extra']) check(csv(r),'COLUMN_COUNT');
});
test('A04: empty, BOM-only and header-only files rejected',()=>{
  for(const content of ['', '\ufeff', header, header+'\n']) check(encode(content),'NO_DATA');
});
test('A05: LF/CRLF, optional BOM and single final line ending produce same result',()=>{
  const expected=validateShipments(parseShipmentCsv(csv(row.join(','))));
  for(const delimiter of ['\n','\r\n']) for(const bom of ['', '\ufeff']) for(const end of ['',delimiter]) {
    assert.deepEqual(validateShipments(parseShipmentCsv(encode(bom+header+delimiter+row.join(',')+end))),expected);
  }
});
test('A05: interior blank and second terminal newline rejected; bare CR rejected',()=>{
  check(csv(row.join(','),'',row.join(',')),'EMPTY_RECORD');
  check(encode(header+'\n'+row.join(',')+'\n\n'),'EMPTY_RECORD');
  check(encode(header+'\r'+row.join(',')),'INVALID_LINE_ENDING');
});
test('A05: quoted commas and doubled quotes decode without silent changes',()=>{
  const parsed=parseShipmentCsv(csv('"SHP,1",HOU,AUS,2026-10-01,1,"CA""R1"'));
  assert.equal(parsed.rows[0]!.values.shipment_id,'SHP,1');
  assert.equal(parsed.rows[0]!.values.carrier_code,'CA"R1');
  assert.equal(validateShipments(parsed).rejectedCount,1);
});
test('A05: decoded quotes count once for cell limit',()=>{
  const quote=(n:number)=>'"'+'""'.repeat(n)+'",HOU,AUS,2026-10-01,1,CAR1';
  assert.equal(parseShipmentCsv(csv(quote(128))).rows[0]!.values.shipment_id.length,128);
  check(csv(quote(129)),'CELL_TOO_LONG');
});
test('A05: embedded LF and CRLF in quoted fields rejected',()=>{
  for(const newline of ['\n','\r\n']) check(csv(`"SHP${newline}1",HOU,AUS,2026-10-01,1,CAR1`),'INVALID_CSV');
});
test('A05: only surrounding ASCII spaces trimmed; original rejected values retained',()=>{
  assert.equal(result(row.map(v=>' '+v+' ')).validCount,1);
  assert.equal(result(altered(0,'shp1')).rejectedRows[0]!.values.shipment_id,'shp1');
  assert.equal(result(altered(0,'\tSHP1')).rejectedCount,1);
  assert.equal(result(altered(0,'\u00a0SHP1')).rejectedCount,1);
  check(csv(altered(0,' '.repeat(125)+'SHP1').join(',')),'CELL_TOO_LONG');
});
test('A05: leap years, month bounds and 2000–2099 enforced independently of today',()=>{
  for(const date of ['2000-02-29','2024-02-29','2000-01-01','2099-12-31']) assert.equal(result(altered(3,date)).validCount,1,date);
  for(const date of ['2026-02-29','2026-02-30','2026-04-31','2026-00-01','2026-13-01','2026-01-00','1999-12-31','2100-01-01','2026-1-01']) {
    assert.equal(result(altered(3,date)).rejectedRows[0]!.errors[0]!.code,'INVALID_DATE',date);
  }
});
test('A05: exact integer grams, minimum and maximum weights, canonical formatting',()=>{
  for(const [text,grams,canonical] of [['0.001',1,'0.001'],['12.500',12500,'12.5'],['100000',100000000,'100000'],['0001.010',1010,'1.01']] as const) {
    const r=result(altered(4,text)); assert.equal(r.acceptedRows[0]!.weightGrams,grams); assert.equal(formatKilograms(grams),canonical);
  }
});
test('A05: invalid weight grammar and range never rounded or coerced',()=>{
  for(const weight of ['0','0.000','100000.001','1.0000','1e3','+1','-1','NaN','Infinity','.5','1.','9'.repeat(128)]) {
    assert.equal(result(altered(4,weight)).rejectedRows[0]!.errors[0]!.code,'INVALID_WEIGHT',weight);
  }
  for(const value of [NaN,Infinity,0,0.1,-1,100000001]) assert.throws(()=>formatKilograms(value),RangeError);
});
test('A05: field formats and boundaries; destination differs; one primary error per field',()=>{
  for(const [index,valids,invalids] of [
    [0,['A','A'.repeat(32),'A_1-X'],['','-A','A'.repeat(33),'a']],
    [1,['AA','A'.repeat(8)],['A','A'.repeat(9),'aa']],
    [2,['AA','A'.repeat(8)],['A','A'.repeat(9),'aa']],
    [5,['AA','A'.repeat(12)],['A','A'.repeat(13),'aa']],
  ] as const) {
    for(const v of valids) assert.equal(result(altered(index,v)).validCount,1);
    for(const v of invalids) assert.equal(result(altered(index,v)).rejectedCount,1);
  }
  assert.equal(result(altered(2,'HOU')).rejectedRows[0]!.errors[0]!.code,'SAME_LOCATION');
  const allBad=result(['','a','a','x','0','x']);
  assert.equal(allBad.rejectedRows[0]!.errors.length,6);
});
test('A05: duplicates invalidate all occurrences after trimming, even already-invalid rows',()=>{
  const r=validateShipments(parseShipmentCsv(csv(row.join(','),altered(0,' SHP1 ').join(','),altered(3,'bad').join(','))));
  assert.equal(r.validCount,0); assert.equal(r.rejectedCount,3);
  assert.deepEqual(r.rejectedRows.map(x=>x.recordNumber),[2,3,4]);
  assert.ok(r.rejectedRows.every(x=>x.errors.some(e=>e.code==='DUPLICATE_SHIPMENT_ID')));
  assert.equal(r.rejectedRows[2]!.errors.length,2);
});
test('A05: repeated runs deterministic and input not mutated; every record categorized once',()=>{
  const input=parseShipmentCsv(csv(row.join(','),altered(0,'shp2').join(',')));
  const before=JSON.stringify(input), expected=validateShipments(input);
  for(let i=0;i<20;i++) assert.deepEqual(validateShipments(input),expected);
  assert.equal(JSON.stringify(input),before);
  assert.equal(expected.validCount+expected.rejectedCount,expected.totalRows);
  assert.deepEqual([...expected.acceptedRows,...expected.rejectedRows].map(r=>r.recordNumber).sort(),[2,3]);
});
test('A05: synthetic sample files match documented row outcomes',()=>{
  const good=validateShipments(parseShipmentCsv(readFileSync('samples/valid.csv')));
  const bad=validateShipments(parseShipmentCsv(readFileSync('samples/invalid-rows.csv')));
  assert.deepEqual([good.totalRows,good.validCount,good.rejectedCount],[3,3,0]);
  assert.deepEqual([bad.totalRows,bad.validCount,bad.rejectedCount],[4,1,3]);
});
