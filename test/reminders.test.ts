import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeReminders, rolloverExpiry } from '../src/lib/domain/reminders';

const base = { documentId: 'doc-1', lineUserId: 'U1', docTypeKey: 'vehicle_tax' };

test('ภาษีรถได้ครบ 4 รอบเมื่อใส่ล่วงหน้านาน', () => {
  const rows = computeReminders({ ...base, expiryDate: '2027-06-01', today: '2026-09-10' });
  assert.deepEqual(rows.map((r) => r.offset_days), [-90, -30, -7, 1]);
  assert.equal(rows[0].send_on, '2027-03-03');
  assert.equal(rows[3].kind, 'due');
});

test('ใส่ตอนเหลือ 10 วัน — ไม่ส่งการเตือน D-90 ย้อนหลัง', () => {
  const rows = computeReminders({ ...base, expiryDate: '2026-09-20', today: '2026-09-10' });
  assert.deepEqual(rows.map((r) => r.offset_days), [-7, 1]);
});

test('เอกสารที่หมดอายุไปแล้ว ยังต้องถามว่าต่อหรือยัง', () => {
  const rows = computeReminders({ ...base, expiryDate: '2026-01-01', today: '2026-09-10' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'due');
  assert.equal(rows[0].send_on, '2026-09-11');
});

test('พาสปอร์ตเตือนตั้งแต่เหลือ 9 เดือน', () => {
  const rows = computeReminders({
    ...base, docTypeKey: 'passport', expiryDate: '2028-01-01', today: '2026-09-10',
  });
  assert.equal(rows[0].offset_days, -270);
  assert.equal(rows[0].send_on, '2027-04-06');
});

test('rolloverExpiry เลื่อนจากวันเดิม ไม่ใช่จากวันนี้', () => {
  const next = rolloverExpiry({ docTypeKey: 'vehicle_tax', currentExpiry: '2026-12-15', today: '2026-12-16' });
  assert.equal(next, '2027-12-15');
});

test('rolloverExpiry บวกต่อจนพ้นวันนี้ ถ้าปล่อยขาดมานาน', () => {
  const next = rolloverExpiry({ docTypeKey: 'vehicle_tax', currentExpiry: '2023-03-01', today: '2026-09-10' });
  assert.equal(next, '2027-03-01');
});

test('ใบขับขี่อายุ 5 ปี', () => {
  const next = rolloverExpiry({ docTypeKey: 'driving_license', currentExpiry: '2026-05-03', today: '2026-05-04' });
  assert.equal(next, '2031-05-03');
});

test('ประเภทที่ไม่รู้อายุปกติ คืน null เพื่อไปถามผู้ใช้', () => {
  assert.equal(rolloverExpiry({ docTypeKey: 'visa', currentExpiry: '2026-01-01', today: '2026-09-10' }), null);
});
