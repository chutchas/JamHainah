import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../src/lib/ocr/openai';

test('แปลง พ.ศ. ที่โมเดลเผลอคืนมาเป็น ค.ศ.', () => {
  const out = normalize({ isDocument: true, docTypeKey: 'vehicle_tax', label: '1กก 1234', expiryDate: '2569-12-15', confidence: 0.9 });
  assert.equal(out.expiryDate, '2026-12-15');
});

test('ปฏิเสธวันที่ที่ไม่มีจริง แล้วลด confidence', () => {
  const out = normalize({ isDocument: true, docTypeKey: 'cmi', label: null, expiryDate: '2026-02-31', confidence: 0.95 });
  assert.equal(out.expiryDate, null);
  assert.ok(out.confidence <= 0.3, 'ไม่มีวันที่ = ต้อง confidence ต่ำ เพื่อให้ไปฉาก 02b');
});

test('ประเภทที่ไม่รู้จักกลายเป็น null ไม่ใช่ค่ามั่ว', () => {
  const out = normalize({ isDocument: true, docTypeKey: 'อะไรก็ไม่รู้', label: null, expiryDate: '2026-12-15', confidence: 0.9 });
  assert.equal(out.docTypeKey, null);
});

test('confidence ถูก clamp ให้อยู่ใน 0..1', () => {
  assert.equal(normalize({ confidence: 5, expiryDate: '2026-12-15' }).confidence, 1);
  assert.equal(normalize({ confidence: -2, expiryDate: '2026-12-15' }).confidence, 0);
});

test('รูปที่ไม่ใช่เอกสารถูกทำเครื่องหมายไว้', () => {
  assert.equal(normalize({ isDocument: false }).isDocument, false);
});
