import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, addMonths, daysBetween, formatThai, humanRemaining,
  isISODate, normalizeYear, todayInBangkok, parseThaiDateText, resolveYear,
} from '../src/lib/domain/thaiDate';

test('formatThai แปลงเป็น พ.ศ. เสมอ', () => {
  assert.equal(formatThai('2026-12-15'), '15 ธ.ค. 2569');
  assert.equal(formatThai('2027-01-01'), '1 ม.ค. 2570');
});

test('normalizeYear รับได้ทั้ง พ.ศ. และ ค.ศ.', () => {
  assert.equal(normalizeYear(2569), 2026);
  assert.equal(normalizeYear(2026), 2026);
});

test('addMonths clamp ปลายเดือน ไม่ล้นไปเดือนถัดไป', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2027-01-31', 1), '2028-02-29'.slice(0, 4) === '2028' ? '2027-02-28' : '2027-02-28');
  assert.equal(addMonths('2026-12-15', 12), '2027-12-15');
});

test('addDays ข้ามปีได้ถูกต้อง', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});

test('daysBetween ไม่เพี้ยนข้าม DST/timezone', () => {
  assert.equal(daysBetween('2026-09-10', '2026-12-15'), 96);
  assert.equal(daysBetween('2026-12-15', '2026-09-10'), -96);
});

test('isISODate ปฏิเสธวันที่ที่ไม่มีจริง', () => {
  assert.equal(isISODate('2026-02-31'), false);
  assert.equal(isISODate('2026-13-01'), false);
  assert.equal(isISODate('15/12/2569'), false);
  assert.equal(isISODate('2026-02-28'), true);
});

test('todayInBangkok คืนรูปแบบ YYYY-MM-DD', () => {
  // 2026-01-01 00:30 ICT = 2025-12-31 17:30 UTC — ต้องได้ 2026-01-01 ไม่ใช่ 2025-12-31
  assert.equal(todayInBangkok(new Date('2025-12-31T17:30:00Z')), '2026-01-01');
});

test('humanRemaining อ่านเป็นภาษาคน', () => {
  assert.equal(humanRemaining('2026-09-10', '2026-09-10'), 'ครบกำหนดวันนี้');
  assert.equal(humanRemaining('2026-09-10', '2026-12-15'), 'เหลือ 96 วัน');
  assert.equal(humanRemaining('2026-09-10', '2026-09-09'), 'เลยกำหนดเมื่อวาน');
});

/* ---------------- วันที่ที่ผู้ใช้พิมพ์เอง ---------------- */

test('ปีสองหลักของคนไทยคือ พ.ศ.', () => {
  // "73" = พ.ศ. 2573 = ค.ศ. 2030 ไม่ใช่ ค.ศ. 2073 และไม่ใช่ พ.ศ. 2473
  assert.equal(resolveYear(73, '2026-09-11'), 2030);
  assert.equal(resolveYear(69, '2026-09-11'), 2026);
  assert.equal(resolveYear(80, '2026-09-11'), 2037);
  // สองหลักที่ตีเป็น พ.ศ. แล้วกลายเป็นอดีต ต้องตกมาเป็น ค.ศ.
  assert.equal(resolveYear(26, '2026-09-11'), 2026);
  assert.equal(resolveYear(30, '2026-09-11'), 2030);
  // สี่หลักยังทำงานเหมือนเดิม
  assert.equal(resolveYear(2573, '2026-09-11'), 2030);
  assert.equal(resolveYear(2030, '2026-09-11'), 2030);
});

test('อ่านวันที่จากข้อความที่พิมพ์มา', () => {
  const today = '2026-09-11';
  const cases: Array<[string, string | null]> = [
    ['บัตรประชาชน 23/7/73', '2030-07-23'],
    ['หมดอายุ 23/07/2573', '2030-07-23'],
    ['ภาษีรถ 1กก 1234 หมด 31/12/69', '2026-12-31'],
    ['หมด 5-3-70', '2027-03-05'],
    ['หมดอายุ 9.6.69', '2026-06-09'],
    ['2573-07-23', '2030-07-23'],
    ['พ.ร.บ. หมดอายุ 30 มิ.ย. 69', '2026-06-30'],
    ['หมดอายุ 23 กรกฎาคม 2573', '2030-07-23'],
    // 31 ก.พ. ไม่มีจริง ห้ามเลื่อนไปเป็น 3 มี.ค. เงียบ ๆ
    ['หมด 31/2/70', null],
    ['สวัสดีครับ', null],
  ];
  for (const [text, want] of cases) {
    assert.equal(parseThaiDateText(text, today), want, text);
  }
});

test('ใบขับขี่หมด 1 ม.ค. 71 — ชื่อเดือนย่อที่มีสระ', () => {
  // เคยพลาดเพราะใช้ [ก-ฮ] ซึ่งไม่ครอบคลุมสระกับวรรณยุกต์ "มิ.ย." เลยไม่ match
  assert.equal(parseThaiDateText('ใบขับขี่หมด 1 ม.ค. 71', '2026-09-11'), '2028-01-01');
});
