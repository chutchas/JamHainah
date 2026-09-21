/**
 * แท็บลูกค้า การลบข้อมูลหลังบล็อก และชื่อผู้ใช้ที่ไม่หายอีก
 *
 * ทั้งสามเรื่องเป็น "สัญญา" กับลูกค้า — หน้า /privacy เขียนไว้แบบไหน โค้ดต้องทำแบบนั้น
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

const LIST = 'src/app/api/admin/customers/route.ts';
const ONE = 'src/app/api/admin/customers/[id]/route.ts';

test('หน้าลูกค้าดูได้อย่างเดียว — ไม่มีทางแก้เอกสารแทนลูกค้า', () => {
  const one = read(ONE);
  assert.ok(!/export async function (POST|PUT|PATCH|DELETE)/.test(one), 'หน้ารายคนมีทางเขียนข้อมูล');
  for (const f of [LIST, ONE]) {
    assert.ok(!/\.(update|insert|upsert|delete)\(/.test(read(f)), `${f} แก้ข้อมูลในฐานตรง ๆ ได้`);
  }
  // POST ของรายชื่อทำได้อย่างเดียว คือเติมชื่อที่ LINE ให้มา
  const list = read(LIST);
  assert.ok(!/export async function (PUT|PATCH|DELETE)/.test(list));
  assert.ok(!list.includes("from('documents').update") && !list.includes('updateDocument'));
  assert.match(list, /body\.op !== 'fillNames'/);
});

test('ดึงชื่อจาก LINE: เฉพาะเจ้าของ/หัวหน้า ลงประวัติ และมีเพดานต่อครั้ง', () => {
  const list = read(LIST);
  const post = list.slice(list.indexOf('export async function POST'));
  assert.match(post, /if \(!can\(who, 'people'\)\)/);
  assert.match(post, /repo\.audit\(/);
  assert.match(post, /\.limit\(FILL_MAX\)/);
  assert.match(post, /\.is\('unfollowed_at', null\)/, 'ไม่ต้องถามชื่อคนที่บล็อกแล้ว');
});

test('ดึงโปรไฟล์ไม่สำเร็จต้องทิ้งร่องรอยใน log', () => {
  const c = read('src/lib/line/client.ts');
  const fn = c.slice(c.indexOf('export async function getProfile'), c.indexOf('export async function getProfile') + 1200);
  assert.match(fn, /console\.warn\(`\[line\] getProfile/);
  assert.ok(!/console\.\w+\([^)]*\$\{userId\}/.test(fn), 'อย่าเขียนรหัสผู้ใช้เต็มลง log');
});

test('พนักงานเห็นเฉพาะลูกค้าที่มีเคสเปิด — ด่านอยู่ที่เซิร์ฟเวอร์', () => {
  const auth = read('src/lib/admin/auth.ts');
  const people = auth.match(/people:\s*\[([^\]]*)\]/)?.[1] ?? '';
  assert.ok(people.includes('owner') && people.includes('manager'), 'เจ้าของ/หัวหน้าต้องเห็นลูกค้าทุกคน');
  assert.ok(!people.includes('staff'), 'พนักงานเห็นลูกค้าทุกคนได้');

  for (const f of [LIST, ONE]) {
    const s = read(f);
    assert.match(s, /can\(who, 'people'\)/, `${f} ไม่ได้เช็กสิทธิ์ people`);
    assert.match(s, /OPEN_STATUSES/, `${f} ไม่ได้ดูว่ามีเคสเปิดอยู่`);
  }
  assert.match(read(ONE), /status: 403/);
});

test('เปิดดูข้อมูลลูกค้าต้องถูกจดลงประวัติ', () => {
  const s = read(ONE);
  const gate = s.indexOf("can(who, 'people')");
  const log = s.indexOf('auditViewOncePerDay(');
  const docs = s.indexOf(".from('documents')");
  assert.ok(log > gate, 'จดประวัติก่อนเช็กสิทธิ์ = จดการดูที่ไม่ได้เกิดขึ้น');
  assert.ok(log < docs, 'ต้องจดก่อนดึงเอกสารออกมา');
  assert.match(read('src/app/api/admin/audit/route.ts'), /'customer\.view':/);
});

test('บล็อกเกิน 30 วัน ข้อมูลถูกลบจริง ตรงกับที่หน้า /privacy บอก', () => {
  const repo = read('src/lib/db/repo.ts');
  assert.match(repo, /export const BLOCKED_KEEP_DAYS = 30;/);
  assert.match(repo, /export async function purgeBlockedUsers/);
  assert.match(read('src/lib/reminders/run.ts'), /await purgeBlockedUsers\(\)/);

  const privacy = read('src/app/privacy/page.tsx');
  assert.match(privacy, /ครบ 30 วัน/);
  assert.match(privacy, /ทีมงานเปิดดู/);
});

test('ข้อความจากผู้ใช้ไม่ลบชื่อที่ได้ตอนแอดเพื่อน', () => {
  const repo = read('src/lib/db/repo.ts');
  assert.ok(!repo.includes('display_name: displayName ?? null'), 'upsertUser ยังเขียนชื่อทับเป็นค่าว่าง');
  assert.match(repo, /if \(displayName\) row\.display_name = displayName;/);

  const h = read('src/lib/line/handlers.ts');
  // ที่เดียวที่เรียกโดยไม่มีชื่อได้ คือใน touchUser ซึ่งเติมชื่อต่อให้เอง
  const bare = h.match(/repo\.upsertUser\(userId\)/g) ?? [];
  assert.equal(bare.length, 1, 'ยังมีที่เรียก upsertUser โดยไม่ผ่าน touchUser');
  assert.match(h, /async function touchUser/);
});

test('หน้าสรุปแยก "เริ่มใช้แล้ว" ออกจาก "เอกสาร/คน"', () => {
  const s = read('src/app/api/admin/summary/route.ts');
  assert.ok(!s.includes('docsPerUser'), 'ยังหารเอกสารด้วยทุกคนที่แอด');
  assert.match(s, /started/);
  assert.match(s, /docsPerActive/);
});

test('แท็บลูกค้าอยู่ในเมนู', () => {
  assert.match(read('src/app/admin/Shell.tsx'), /href: '\/admin\/customers'/);
});
