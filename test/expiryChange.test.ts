import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyExpiryChange } from '../src/lib/domain/reminders';
import { DOC_TYPES } from '../src/lib/domain/docTypes';

/**
 * แยกให้ออกระหว่าง "ต่ออายุ" กับ "ครั้งก่อนอ่านผิด"
 *
 * ไม่ใช่แค่เรื่องข้อความ — renewed_count คือตัวเลขที่ v_shop_performance
 * ใช้บอกว่าร้านไหนส่งลูกค้ากลับมาต่ออายุได้จริง ถ้านับคำผิดปนเข้าไป
 * ตัวเลขที่เอาไปคุยกับร้านจะเกินความจริง
 */

const tax = (from: string, to: string) =>
  classifyExpiryChange({ docTypeKey: 'vehicle_tax', from, to });

test('วันเดิมเป๊ะ = same', () => {
  assert.equal(tax('2026-12-15', '2026-12-15'), 'same');
});

test('ขยับไม่กี่วัน = อ่านผิด ไม่ใช่ต่ออายุ', () => {
  assert.equal(tax('2026-12-15', '2026-12-18'), 'correction');
  assert.equal(tax('2026-12-15', '2027-01-20'), 'correction'); // 36 วัน ยังอยู่ในกรอบ
});

test('วันใหม่ย้อนหลังกว่าเดิม = อ่านผิดเสมอ (ต่ออายุถอยหลังไม่ได้)', () => {
  assert.equal(tax('2026-12-15', '2026-12-12'), 'correction');
  assert.equal(tax('2026-12-15', '2025-12-15'), 'correction');
});

test('ห่างเท่ารอบของเอกสาร = ต่ออายุ', () => {
  assert.equal(tax('2026-12-15', '2027-12-15'), 'renewal');   // 365 วัน = 1 รอบพอดี
  assert.equal(tax('2026-12-15', '2027-09-15'), 'renewal');   // 274 วัน เกิน 70% ของรอบ
});

test('ห่างเกินคำผิด แต่ไม่ถึงหนึ่งรอบ = ไม่ชัด ต้องถาม', () => {
  assert.equal(tax('2026-12-15', '2027-05-15'), 'unclear');   // 151 วัน
});

test('ใบขับขี่รอบ 5 ปี ใช้เกณฑ์ของตัวเอง ไม่ใช่ 1 ปี', () => {
  const dl = (from: string, to: string) =>
    classifyExpiryChange({ docTypeKey: 'driving_license', from, to });
  assert.equal(dl('2026-05-03', '2031-05-03'), 'renewal');
  // ขยับ 1 ปีสำหรับเอกสาร 5 ปี ยังไม่ใช่รอบใหม่
  assert.equal(dl('2026-05-03', '2027-05-03'), 'unclear');
});

test('บัตรประชาชนรอบ 8 ปี', () => {
  const id = (from: string, to: string) =>
    classifyExpiryChange({ docTypeKey: 'national_id', from, to });
  assert.equal(id('2565-01-01'.replace('2565', '2022'), '2030-01-01'), 'renewal');
  assert.equal(id('2022-01-01', '2024-01-01'), 'unclear');
});

test('เอกสารที่ไม่รู้รอบ (วีซ่า) ใช้เกณฑ์ 180 วัน', () => {
  const visa = (from: string, to: string) =>
    classifyExpiryChange({ docTypeKey: 'visa', from, to });
  assert.equal(visa('2026-01-01', '2026-01-10'), 'correction');
  assert.equal(visa('2026-01-01', '2026-04-15'), 'unclear');   // 104 วัน
  assert.equal(visa('2026-01-01', '2026-08-01'), 'renewal');   // 212 วัน
});

test('ทุกประเภทจำแนกได้โดยไม่ throw', () => {
  for (const t of DOC_TYPES) {
    const r = classifyExpiryChange({ docTypeKey: t.key, from: '2026-01-01', to: '2027-06-01' });
    assert.ok(['same', 'correction', 'renewal', 'unclear'].includes(r), `${t.key} -> ${r}`);
  }
});

test('เอกสารที่คนหนึ่งมีได้ใบเดียว ถูกทำเครื่องหมายไว้ครบ', () => {
  const expected = ['national_id', 'driving_license', 'passport', 'social_security'];
  const actual = DOC_TYPES.filter((t) => t.singleton).map((t) => t.key).sort();
  assert.deepEqual(actual, [...expected].sort());
});

test('ทุกประเภทมี group สำหรับชวนเพิ่มใบต่อไป', () => {
  for (const t of DOC_TYPES) {
    assert.ok(['vehicle', 'identity', 'insurance', 'other'].includes(t.group), t.key);
  }
});
