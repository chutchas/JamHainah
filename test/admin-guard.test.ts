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
    // ต้องผ่านด่านกลางเสมอ — ห้ามเช็คสิทธิ์เองทีละ route
    // ด่านที่เขียนซ้ำหลายที่ คือด่านที่วันหนึ่งจะมีที่หนึ่งเช็คไม่ครบ
    assert.match(src, /requireAdmin/, `${rel} ไม่ได้ผ่าน requireAdmin`);
  }
});

/**
 * เขียนได้ แต่ต้องทิ้งร่องรอยเสมอ
 *
 * ตอนมีคนเดียว "ใครแก้" ไม่ใช่คำถาม พอมีคนที่สองมันกลายเป็นคำถามแรก
 * และการเขียนที่ไม่มีร่องรอย จะรู้ตัวก็ต่อเมื่อต้องการประวัติแล้วไม่มี
 */
test('ทุก route ที่เขียนข้อมูล ต้องบันทึก audit', () => {
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
    const writes = /export async function (POST|PATCH|PUT|DELETE)\b/.test(src);
    if (!writes) continue;
    assert.match(src, /repo\.audit\(/, `${rel} เขียนข้อมูลโดยไม่บันทึก audit`);
  }
});

test('หน้าสรุปยังต้องอ่านอย่างเดียว', () => {
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

  const summary = path.join(dir, 'summary', 'route.ts');
  const src = fs.readFileSync(summary, 'utf8');
  for (const verb of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    assert.ok(!new RegExp(`export async function ${verb}\\b`).test(src), `summary มี ${verb}`);
  }
  for (const write of ['.insert(', '.update(', '.delete(', '.upsert(']) {
    assert.ok(!src.includes(write), `summary เขียนฐานข้อมูลด้วย ${write}`);
  }
});
