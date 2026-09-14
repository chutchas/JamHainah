/**
 * ชื่อที่คนอ่านเห็น ต้องเป็น "ห้องทำงาน" ไม่ใช่ "หลังบ้าน"
 *
 * คำว่าหลังบ้านเคยหลุดรอดมาได้เพราะเทสต์เดิมตรวจแค่ข้อความในไลน์
 * ไม่ได้ตรวจหน้าเว็บ — คราวนี้ตรวจทั้ง src
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(e.name)) out.push(full);
  }
  return out;
}

test('ไม่มีคำว่า หลังบ้าน เหลืออยู่ใน src', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const bad = walk(path.join(root, 'src'))
    .filter((f) => fs.readFileSync(f, 'utf8').includes('หลังบ้าน'))
    .map((f) => path.relative(root, f));
  assert.deepEqual(bad, [], `ยังมีคำว่าหลังบ้านอยู่ใน:\n  ${bad.join('\n  ')}`);
});
