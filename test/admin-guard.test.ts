import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * หน้าหลังบ้านเห็นข้อมูลของลูกค้าทุกคน
 *
 * ด่านที่กันไว้มีสองชั้น และต้องมีครบทั้งคู่ในทุก route ใต้ /api/admin:
 *   1. authenticateLiff — idToken ต้องผ่านการตรวจกับเซิร์ฟเวอร์ของ LINE
 *      (ไม่งั้นใครก็ปลอม header มาเองได้)
 *   2. env.adminUserIds — user id ที่ผ่านด่านแรก ต้องอยู่ใน allowlist
 *      (ไม่งั้นลูกค้าทุกคนที่มี LINE ก็เปิดหน้านี้ได้)
 *
 * test นี้มีเพราะ route ที่เพิ่มทีหลังคือ route ที่คนลืมใส่ด่าน
 */
test('ทุก API ใต้ /api/admin ต้องผ่านทั้ง LINE และ allowlist', () => {
  const dir = path.resolve(import.meta.dirname, '..', 'src', 'app', 'api', 'admin');
  if (!fs.existsSync(dir)) return;

  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === 'route.ts') files.push(full);
    }
  };
  walk(dir);
  assert.ok(files.length > 0, 'ไม่เจอ route ใต้ /api/admin เลย');

  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(path.resolve(import.meta.dirname, '..'), f);
    assert.match(src, /authenticateLiff/, `${rel} ไม่ได้ตรวจ idToken กับ LINE`);
    assert.match(src, /env\.adminUserIds/, `${rel} ไม่ได้เช็ค allowlist ของผู้ดูแล`);
  }
});

/**
 * หลังบ้านอ่านอย่างเดียวโดยตั้งใจ
 * ปุ่มที่แก้ข้อมูลลูกค้าได้จากมือถือ คือปุ่มที่กดพลาดได้จากมือถือ
 * และเราไม่มี audit log ว่าใครแก้อะไรเมื่อไหร่
 */
test('API หลังบ้านต้องไม่มีทางเขียนข้อมูล', () => {
  const dir = path.resolve(import.meta.dirname, '..', 'src', 'app', 'api', 'admin');
  if (!fs.existsSync(dir)) return;

  const walk = (d: string, out: string[] = []): string[] => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full, out);
      else if (e.name === 'route.ts') out.push(full);
    }
    return out;
  };

  for (const f of walk(dir)) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(path.resolve(import.meta.dirname, '..'), f);
    for (const verb of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      assert.ok(!new RegExp(`export async function ${verb}\\b`).test(src), `${rel} มี ${verb}`);
    }
    for (const write of ['.insert(', '.update(', '.delete(', '.upsert(']) {
      assert.ok(!src.includes(write), `${rel} เขียนฐานข้อมูลด้วย ${write}`);
    }
  }
});
