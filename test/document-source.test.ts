import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DOC_SOURCES } from '../src/lib/db/repo';

/**
 * เทสต์นี้เกิดจากบั๊กจริง
 *
 * constraint ใน migration 0001 เขียนตอนที่ระบบรับแต่รูป: ocr/manual/rollover
 * ต่อมาเพิ่มทางเข้า "พิมพ์วันหมดอายุมาเอง" ซึ่งส่ง source = 'text'
 * TypeScript ผ่าน เทสต์ผ่าน build ผ่าน — แต่ทุก insert จากทางนั้นถูกฐานปฏิเสธ
 * และผู้ใช้เห็นแค่ข้อความขอโทษ จนกว่าจะมีคนบ่นให้ฟัง
 *
 * กติกาที่ไม่มีใครตรวจ คือกติกาที่จะแตกอีกครั้งแน่นอน
 */
const DIR = join(import.meta.dirname, '..', 'supabase', 'migrations');

/** ค่าที่ constraint ล่าสุดอนุญาต — ไล่ migration ตามลำดับเหมือนที่ฐานจริงทำ */
function allowedInDb(): string[] {
  let allowed: string[] = [];
  for (const f of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(DIR, f), 'utf8');
    // เอาครั้งสุดท้ายในไฟล์ เพราะไฟล์เดียวอาจ drop แล้ว add ใหม่
    const all = [...sql.matchAll(/source\s+in\s*\(([^)]*)\)/gi)];
    const last = all.at(-1);
    if (last) allowed = [...last[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  }
  return allowed;
}

test('ค่า source ที่โค้ดส่งได้ ต้องอยู่ใน constraint ของฐานข้อมูลครบ', () => {
  const allowed = allowedInDb();
  assert.ok(allowed.length > 0, 'หา constraint documents_source_check ใน migration ไม่เจอ');
  for (const s of DOC_SOURCES) {
    assert.ok(allowed.includes(s), `โค้ดส่ง source='${s}' ได้ แต่ฐานข้อมูลไม่รับ — ต้องเพิ่ม migration`);
  }
});

test('constraint ไม่อนุญาตค่าที่โค้ดไม่มีทางส่ง', () => {
  // ทางกลับกัน: ค่าที่ฐานรับแต่โค้ดไม่รู้จัก คือค่าที่จะเข้าฐานได้โดยไม่มีใครอ่าน
  for (const s of allowedInDb()) {
    assert.ok((DOC_SOURCES as readonly string[]).includes(s), `ฐานรับ '${s}' แต่โค้ดไม่รู้จักค่านี้`);
  }
});
