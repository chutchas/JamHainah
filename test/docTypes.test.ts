import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOC_TYPES, docType } from '../src/lib/domain/docTypes';

test('ปุ่มขายอยู่บน tier 1 เท่านั้น', () => {
  // กฎเชิงธุรกิจ: ลงแรงสร้าง flow เฉพาะที่มีเงินปลายทาง
  // ถ้ามีใครเผลอใส่ upsell ให้ tier 2/3 test นี้จะจับได้
  for (const t of DOC_TYPES) {
    if (t.upsell) assert.equal(t.tier, 1, `${t.key} มี upsell แต่เป็น tier ${t.tier}`);
  }
});

test('ทุกประเภทมีการเตือนหลังครบกำหนด (ฉาก 08)', () => {
  // ถ้าไม่มี offset > 0 เอกสารจะไม่มีวันต่ออายุตัวเองในฐานข้อมูล
  // แล้วข้อมูลทั้งชุดจะตายภายในหนึ่งรอบปี
  for (const t of DOC_TYPES) {
    assert.ok(t.offsets.some((o) => o > 0), `${t.key} ไม่มีการเตือนหลังครบกำหนด`);
  }
});

test('offsets เรียงจากไกลไปใกล้ และไม่ซ้ำ', () => {
  for (const t of DOC_TYPES) {
    const sorted = [...t.offsets].sort((a, b) => a - b);
    assert.deepEqual(t.offsets, sorted, `${t.key} offsets ไม่ได้เรียงลำดับ`);
    assert.equal(new Set(t.offsets).size, t.offsets.length, `${t.key} มี offset ซ้ำ`);
  }
});

test('key ไม่ซ้ำกัน', () => {
  const keys = DOC_TYPES.map((t) => t.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('ประเภทที่ไม่รู้จัก fallback เป็น custom', () => {
  assert.equal(docType('ไม่มีจริง').key, 'custom');
});

test('tier 3 ไม่ผ่าน OCR', () => {
  for (const t of DOC_TYPES) {
    if (t.tier === 3) assert.equal(t.ocr, false, `${t.key} เป็น tier 3 แต่ยังส่งเข้า OCR`);
  }
});
