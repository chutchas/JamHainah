import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * กฎข้อ 3 — ผู้ใช้ทักก่อน = reply (ฟรี) · เรายิงเอง = push (฿0.06)
 *
 * test นี้มีไว้เพราะถ้า push หลุดเข้าไปใน webhook เมื่อไหร่
 * ต้นทุนต่อผู้ใช้จะพุ่งขึ้นโดยไม่มีใครสังเกต จนกว่าจะเห็นบิลปลายเดือน
 * ซึ่งตอนนั้นสายไปแล้ว
 */

const ALLOWED = [
  'src/lib/reminders/run.ts',
  'src/lib/line/client.ts',
  // ข้อยกเว้นที่แคบที่สุด: ส่งได้เฉพาะหาเจ้าของระบบ มี test บังคับด้านล่าง
  'src/lib/line/admin.ts',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('มีแค่ cron เท่านั้นที่ import push', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const offenders: string[] = [];

  for (const file of walk(path.join(root, 'src'))) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (ALLOWED.includes(rel)) continue;

    const src = fs.readFileSync(file, 'utf8');
    // จับ: import { push } / import { reply, push } / push( ที่ไม่ใช่ .push(
    const importsPush = /import\s*\{[^}]*\bpush\b[^}]*\}\s*from\s*['"][^'"]*line\/client['"]/.test(src);
    if (importsPush) offenders.push(rel);
  }

  assert.deepEqual(
    offenders, [],
    `ไฟล์เหล่านี้ import push() ซึ่งเสียเงินทุกข้อความ:\n  ${offenders.join('\n  ')}`
  );
});

test('handlers.ts ใช้ reply เท่านั้น', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const src = fs.readFileSync(path.join(root, 'src/lib/line/handlers.ts'), 'utf8');
  assert.ok(src.includes('reply'), 'handlers ต้องใช้ reply');

  // ต้องมี lookbehind กันจุด ไม่งั้นไปจับ Array.prototype.push
  // ซึ่งเป็นคำที่ใช้ทั่วไปมาก แล้ว test จะฟ้องผิดจนไม่มีใครเชื่อมันอีก
  // test ที่ร้องเท็จบ่อย ๆ อันตรายกว่าไม่มี test เพราะคนจะเริ่มข้ามมัน
  const linePushCall = /(?<![.\w])push\s*\(/;
  const offending = src.split('\n').filter((l) => linePushCall.test(l));
  assert.deepEqual(offending, [], `handlers ห้ามเรียก push():\n  ${offending.join('\n  ')}`);
});


/**
 * ไฟล์ที่ push ได้ ต้องปิดประตูไม่ให้ส่งหาลูกค้าตั้งแต่หน้าตาของฟังก์ชัน
 *
 * ฟังก์ชันที่รับ userId เป็นพารามิเตอร์ได้ คือฟังก์ชันที่วันหนึ่งจะถูกเรียก
 * ด้วย userId ของลูกค้า แล้วค่าส่งข้อความจะขึ้นโดยไม่มีใครสังเกต
 */
test('notifyAdmin ส่งได้เฉพาะหาเจ้าของระบบ', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const src = fs.readFileSync(path.join(root, 'src/lib/line/admin.ts'), 'utf8');

  assert.match(src, /export async function notifyAdmin\(messages: LineMessage\[\]\)/,
    'ต้องไม่มีพารามิเตอร์ปลายทาง');
  assert.match(src, /env\.adminUserIds/, 'ปลายทางต้องมาจาก env เท่านั้น');
  assert.ok(!/push\(\s*userId/.test(src), 'ห้ามส่งหา userId ที่รับเข้ามา');
});
