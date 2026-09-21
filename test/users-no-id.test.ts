/**
 * ตาราง users ไม่มีคอลัมน์ id — คีย์คือ line_user_id
 *
 * เลือก 'id' จาก users แล้ว Supabase ตอบ error ซึ่งถูกกลืนเป็น 0
 * เคยทำให้หน้าสรุปบอกว่ามีผู้ใช้ 0 คน ทั้งที่มีคนแอดเข้ามาแล้ว
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

function files(dir: string): string[] {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(path.join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [path.join(dir, d.name)] : []);
}

test('ไม่มีที่ไหนเลือกคอลัมน์ id จากตาราง users', () => {
  for (const f of files('src')) {
    const s = read(f);
    for (const m of s.matchAll(/from\('users'\)([\s\S]{0,200}?)\.select\(\s*'([^']*)'/g)) {
      const cols = m[2].split(',').map((c) => c.trim());
      assert.ok(!cols.includes('id'), `${f} เลือก id จาก users ซึ่งไม่มีคอลัมน์นี้`);
    }
  }
});

test('ตัวนับในหน้าสรุปใช้ได้กับทุกตาราง และไม่กลืน error เงียบ', () => {
  const s = read('src/app/api/admin/summary/route.ts');
  assert.ok(!s.includes("select('id', { count"), 'ตัวนับต้องใช้ * ไม่ใช่ id');
  assert.match(s, /select\('\*', \{ count: 'exact', head: true \}\)/);
  assert.match(s, /if \(error\) console\.error/);
});
