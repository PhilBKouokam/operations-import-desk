import { parse } from 'csv-parse/sync';

export const SCHEMA_VERSION = 'shipment-v1' as const;
export const COLUMNS = ['shipment_id', 'origin_code', 'destination_code', 'scheduled_date', 'weight_kg', 'carrier_code'] as const;
export const LIMITS = Object.freeze({ fileBytes: 256 * 1024, dataRecords: 1000, cellCodePoints: 128, recordBytes: 4096 });
export type Field = typeof COLUMNS[number];
export type Values = Record<Field, string>;
export type StructuralCode = 'FILE_TOO_LARGE' | 'INVALID_UTF8' | 'INVALID_LINE_ENDING' | 'EMPTY_RECORD' | 'RECORD_TOO_LARGE' | 'INVALID_CSV' | 'COLUMN_COUNT' | 'CELL_TOO_LONG' | 'INVALID_HEADER' | 'NO_DATA' | 'TOO_MANY_RECORDS';
export class InputError extends Error {
  readonly code: StructuralCode;
  readonly recordNumber: number | undefined;
  constructor(code: StructuralCode, recordNumber?: number) {
    // Deliberately excludes file data and parser exception messages.
    super(recordNumber === undefined ? code : `${code} at record ${recordNumber}`);
    this.name = 'InputError'; this.code = code; this.recordNumber = recordNumber;
  }
}
export interface InputRow { readonly recordNumber: number; readonly values: Readonly<Values> }
export interface ParsedInput { readonly schemaVersion: typeof SCHEMA_VERSION; readonly rows: readonly InputRow[] }

/** Structural validation only. No I/O, identity, queue, persistence or business rules. */
export function parseShipmentCsv(bytes: Uint8Array): ParsedInput {
  if (bytes.byteLength > LIMITS.fileBytes) throw new InputError('FILE_TOO_LARGE');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new InputError('INVALID_UTF8'); }
  if (/\r(?!\n)/u.test(text)) throw new InputError('INVALID_LINE_ENDING');
  // Multiline fields are forbidden: each physical line must parse as one complete record.
  const lines = text.split(/\r?\n/u);
  if (lines.at(-1) === '') lines.pop();
  if (lines.length === 0) throw new InputError('NO_DATA');
  if (lines.length - 1 > LIMITS.dataRecords) throw new InputError('TOO_MANY_RECORDS');
  const rows: InputRow[] = [];
  for (const [index, line] of lines.entries()) {
    const recordNumber = index + 1;
    if (Buffer.byteLength(line, 'utf8') > LIMITS.recordBytes) throw new InputError('RECORD_TOO_LARGE', recordNumber);
    if (line === '') throw new InputError('EMPTY_RECORD', recordNumber);
    let records: string[][];
    try { records = parse(line, { delimiter: ',', quote: '"', escape: '"', relax_quotes: false, relax_column_count: false, skip_empty_lines: false, cast: false }) as string[][]; }
    catch { throw new InputError('INVALID_CSV', recordNumber); }
    const cells = records[0];
    if (records.length !== 1 || !cells || cells.length !== COLUMNS.length) throw new InputError('COLUMN_COUNT', recordNumber);
    if (cells.some(cell => [...cell].length > LIMITS.cellCodePoints)) throw new InputError('CELL_TOO_LONG', recordNumber);
    if (index === 0) {
      if (cells.some((cell, i) => cell !== COLUMNS[i])) throw new InputError('INVALID_HEADER', 1);
      continue;
    }
    const values = Object.fromEntries(COLUMNS.map((column, i) => [column, cells[i]!])) as Values;
    rows.push(Object.freeze({ recordNumber, values: Object.freeze(values) }));
  }
  if (rows.length === 0) throw new InputError('NO_DATA');
  return Object.freeze({ schemaVersion: SCHEMA_VERSION, rows: Object.freeze(rows) });
}

export type RuleCode = 'INVALID_SHIPMENT_ID' | 'INVALID_ORIGIN' | 'INVALID_DESTINATION' | 'SAME_LOCATION' | 'INVALID_DATE' | 'INVALID_WEIGHT' | 'INVALID_CARRIER' | 'DUPLICATE_SHIPMENT_ID';
export interface RowError { field: Field; code: RuleCode; message: string }
export interface AcceptedRow extends Omit<Values, 'weight_kg'> { recordNumber: number; weightGrams: number }
export interface RejectedRow { recordNumber: number; values: Readonly<Values>; errors: RowError[] }
export interface ValidationResult { totalRows: number; validCount: number; rejectedCount: number; acceptedRows: AcceptedRow[]; rejectedRows: RejectedRow[] }
const trimAsciiSpace = (value: string): string => value.replace(/^ +| +$/gu, '');
function validDate(value: string): boolean {
  if (!/^20\d{2}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function grams(value: string): number | null {
  if (!/^\d+(?:\.\d{1,3})?$/u.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const amount = BigInt(whole!) * 1000n + BigInt(fraction.padEnd(3, '0'));
  return amount > 0n && amount <= 100_000_000n ? Number(amount) : null;
}
/** Formatting helper for the later export layer; values remain integer grams internally. */
export function formatKilograms(weightGrams: number): string {
  if (!Number.isSafeInteger(weightGrams) || weightGrams <= 0 || weightGrams > 100_000_000) throw new RangeError('Invalid weight in grams');
  const fraction = String(weightGrams % 1000).padStart(3, '0').replace(/0+$/u, '');
  return `${Math.floor(weightGrams / 1000)}${fraction ? `.${fraction}` : ''}`;
}
/** Pure deterministic business validation; caller must supply structurally parsed input. */
export function* validationSteps(input: ParsedInput): Generator<void, ValidationResult> {
  const counts = new Map<string, number>();
  for (const row of input.rows) {
    const id = trimAsciiSpace(row.values.shipment_id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const result: ValidationResult = { totalRows: input.rows.length, validCount: 0, rejectedCount: 0, acceptedRows: [], rejectedRows: [] };
  let processed = 0;
  for (const row of input.rows) {
    if (processed++ % 100 === 0) yield;
    const v = Object.fromEntries(COLUMNS.map(field => [field, trimAsciiSpace(row.values[field])])) as Values;
    const errors: RowError[] = [];
    const error = (field: Field, code: RuleCode, message: string): void => { errors.push({ field, code, message }); };
    if (!/^[A-Z0-9][A-Z0-9_-]{0,31}$/u.test(v.shipment_id)) error('shipment_id', 'INVALID_SHIPMENT_ID', 'Use 1–32 uppercase letters, digits, hyphens or underscores; start with a letter or digit.');
    if (!/^[A-Z0-9]{2,8}$/u.test(v.origin_code)) error('origin_code', 'INVALID_ORIGIN', 'Use 2–8 uppercase letters or digits.');
    if (!/^[A-Z0-9]{2,8}$/u.test(v.destination_code)) error('destination_code', 'INVALID_DESTINATION', 'Use 2–8 uppercase letters or digits.');
    else if (v.origin_code === v.destination_code) error('destination_code', 'SAME_LOCATION', 'Destination must differ from origin.');
    if (!validDate(v.scheduled_date)) error('scheduled_date', 'INVALID_DATE', 'Use a real date in YYYY-MM-DD format, years 2000–2099.');
    const weightGrams = grams(v.weight_kg);
    if (weightGrams === null) error('weight_kg', 'INVALID_WEIGHT', 'Use a positive weight up to 100000 kg with at most 3 decimal places, without signs or exponents.');
    if (!/^[A-Z0-9]{2,12}$/u.test(v.carrier_code)) error('carrier_code', 'INVALID_CARRIER', 'Use 2–12 uppercase letters or digits.');
    if ((counts.get(v.shipment_id) ?? 0) > 1) error('shipment_id', 'DUPLICATE_SHIPMENT_ID', 'This shipment ID occurs more than once in the file; correct all occurrences.');
    if (errors.length > 0) result.rejectedRows.push({ recordNumber: row.recordNumber, values: row.values, errors });
    else {
      const { weight_kg: _weight, ...fields } = v;
      result.acceptedRows.push({ recordNumber: row.recordNumber, ...fields, weightGrams: weightGrams! });
    }
  }
  result.validCount = result.acceptedRows.length;
  result.rejectedCount = result.rejectedRows.length;
  return result;
}

export function validateShipments(input: ParsedInput): ValidationResult {
  const steps = validationSteps(input);
  for (;;) { const step = steps.next(); if (step.done) return step.value; }
}
