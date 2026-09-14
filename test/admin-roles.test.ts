/**
 * ระดับสิทธิ์ — สามระดับนี้มีความหมายก็ต่อเมื่อเซิร์ฟเวอร์เป็นคนบังคับ
 *
 * การซ่อนปุ่มในหน้าเว็บไม่ใช่การกันสิทธิ์ ใครก็ยิง API ตรงได้
 * test นี้จึงตรวจว่าด่านอยู่ฝั่งเซิร์ฟเวอร์จริง ไม่ใช่แค่หน้าจอ
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_ROLES, ROLE_TH, ROLE_WHAT } from '../src/lib/domain/roles';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

test('ทุกระดับต้องมีชื่อไทยและคำอธิบายว่าทำอะไรได้', () => {
  for (const r of ADMIN_ROLES) {
    assert.ok(ROLE_TH[r]?.length, `${r} ไม่มีชื่อไทย`);
    assert.ok(ROLE_WHAT[r]?.length > 20, `${r} ไม่มีคำอธิบายที่อ่านแล้วตัดสินใจได้`);
  }
});

/**
 * ระดับในโค้ดกับใน check constraint ต้องตรงกัน
 * ไม่ตรงเมื่อไหร่ = เพิ่มคนเข้าทีมแล้วพังตอน insert ซึ่งเป็นตอนที่แก้ยากที่สุด
 */
test('ระดับในโค้ดต้องตรงกับที่ฐานข้อมูลยอมรับ', () => {
  const dir = path.join(root, 'supabase', 'migrations');
  const sql = fs.readdirSync(dir).sort().map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  // เอา constraint ล่าสุดที่ประกาศไว้ — migration ทีหลังทับของเดิม
  const all = [...sql.matchAll(/admins_role_check\s+check\s*\(\s*role\s+in\s*\(([^)]*)\)/g)];
  assert.ok(all.length > 0, 'ไม่เจอ admins_role_check ใน migration');
  const allowed = all[all.length - 1][1].split(',').map((v) => v.trim().replace(/'/g, ''));
  assert.deepEqual([...ADMIN_ROLES].sort(), allowed.sort());
});

/**
 * สิทธิ์ต้องถูกตัดสินจากตารางเดียว ไม่ใช่ if กระจายตามไฟล์
 * คำถาม "ตกลงพนักงานเห็นราคาไหม" ต้องตอบได้ด้วยการอ่านที่เดียว
 */
test('ตาราง CAN เป็นที่เดียวที่บอกว่าใครทำอะไรได้', () => {
  const auth = read('src/lib/admin/auth.ts');
  assert.match(auth, /export const CAN = \{/);
  for (const key of ['team', 'money', 'retry', 'queue']) {
    assert.ok(auth.includes(`${key}:`), `CAN ไม่มีสิทธิ์ ${key}`);
  }
  // พนักงานต้องไม่อยู่ในสองอย่างนี้ ไม่งั้นแยกระดับไปทำไม
  const money = auth.match(/money:\s*\[([^\]]*)\]/)?.[1] ?? '';
  const retry = auth.match(/retry:\s*\[([^\]]*)\]/)?.[1] ?? '';
  assert.ok(!money.includes('staff'), 'พนักงานเห็นเงินได้');
  assert.ok(!retry.includes('staff'), 'พนักงานยิงซ้ำได้');
});

test('ตัวเลขเงินถูกตัดที่เซิร์ฟเวอร์ ไม่ใช่ซ่อนที่หน้าจอ', () => {
  for (const rel of [
    'src/app/api/admin/summary/route.ts',
    'src/app/api/admin/cases/route.ts',
    'src/app/api/admin/cases/[id]/route.ts',
  ]) {
    const src = read(rel);
    assert.match(src, /can\(who, 'money'\)/, `${rel} ไม่ได้เช็คสิทธิ์ก่อนส่งตัวเลขเงิน`);
    assert.match(src, /seesMoney \?/, `${rel} ส่งตัวเลขเงินออกไปโดยไม่ดูสิทธิ์`);
  }
});

test('ปุ่มที่เสียเงินต้องมีด่านฝั่งเซิร์ฟเวอร์', () => {
  assert.match(read('src/app/api/admin/reminders/route.ts'), /can\(who, 'retry'\)/,
    'ยิงซ้ำไม่มีด่านสิทธิ์');
});

/** เปลี่ยนระดับตัวเองได้ = เจ้าของคนเดียวที่เผลอลดตัวเอง จะไม่มีใครเลื่อนกลับให้ */
test('แตะระดับหรือสิทธิ์ของตัวเองไม่ได้', () => {
  const src = read('src/app/api/admin/team/route.ts');
  assert.match(src, /ถอดสิทธิ์ตัวเองไม่ได้/);
  assert.match(src, /เปลี่ยนระดับของตัวเองไม่ได้/);
});
