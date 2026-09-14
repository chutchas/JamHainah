/**
 * บัตรผ่านห้องทำงาน — ทุก test ในไฟล์นี้คือ "ของปลอมต้องใช้ไม่ได้"
 *
 * คุกกี้อยู่ในมือของคนที่ถือมัน แก้ได้ตามใจ ลายเซ็นคือสิ่งเดียวที่กันไว้
 * ถ้าวันไหนมีคนแก้วิธีเซ็นแล้วลืมคิดเรื่องนี้ ให้ test พังตรงนี้ ไม่ใช่พังตอนมีคนเข้ามาได้
 */
process.env.ADMIN_SESSION_SECRET ??= 'test-secret-for-signing-admin-cookies-only';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueSession, readSession } from '../src/lib/admin/session';

const USER = 'U0123456789abcdef0123456789abcdef';

test('บัตรที่เราออกเอง อ่านกลับได้เป็นคนเดิม', () => {
  assert.equal(readSession(issueSession(USER)), USER);
});

test('ไม่มีคุกกี้ หรือคุกกี้มั่ว ต้องไม่ผ่าน', () => {
  for (const bad of [undefined, '', 'อะไรก็ไม่รู้', 'abc.def', '.', 'x.']) {
    assert.equal(readSession(bad as string | undefined), null, `ผ่านมาได้ด้วยค่า ${String(bad)}`);
  }
});

test('แก้ user id ในบัตรแล้วต้องใช้ไม่ได้', () => {
  const real = issueSession(USER);
  const sig = real.slice(real.lastIndexOf('.'));
  const forged = Buffer.from(`Uffffffffffffffffffffffffffffffff.${Date.now() + 60_000}`, 'utf8')
    .toString('base64url') + sig;
  assert.equal(readSession(forged), null, 'บัตรที่ถูกแก้ชื่อ ยังใช้ได้อยู่');
});

test('ต่ออายุเองในบัตรแล้วต้องใช้ไม่ได้', () => {
  const real = issueSession(USER);
  const sig = real.slice(real.lastIndexOf('.'));
  const stretched = Buffer.from(`${USER}.${Date.now() + 400 * 86400_000}`, 'utf8')
    .toString('base64url') + sig;
  assert.equal(readSession(stretched), null, 'บัตรที่ถูกยืดอายุ ยังใช้ได้อยู่');
});

test('บัตรหมดอายุแล้วต้องใช้ไม่ได้', () => {
  const issuedLongAgo = issueSession(USER, Date.now() - 9 * 60 * 60 * 1000);
  assert.equal(readSession(issuedLongAgo), null, 'บัตรเมื่อ 9 ชั่วโมงก่อนยังใช้ได้');
});

test('ลายเซ็นสั้นหรือยาวผิด ต้องไม่ทำให้ระบบพัง', () => {
  const real = issueSession(USER);
  const body = real.slice(0, real.lastIndexOf('.'));
  assert.equal(readSession(`${body}.สั้นไป`), null);
  assert.equal(readSession(`${body}.${'y'.repeat(500)}`), null);
});
