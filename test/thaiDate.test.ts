import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, addMonths, daysBetween, formatThai, humanRemaining,
  isISODate, normalizeYear, todayInBangkok,
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
