import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * หน้าหลังบ้านเห็นข้อมูลของลูกค้าทุกคน
 *
 * ด่านที่กันไว้มีสองชั้น และต้องมีครบทั้งคู่ในทุก route ใต้ /api/admin:
 *   1. รู้ว่าเป็นใคร — คุกกี้ที่เราเซ็นเอง หรือ idToken ที่ตรวจกับ LINE แล้ว
 *      (ไม่งั้นใครก็ปลอม header หรือคุกกี้มาเองได้)
 *   2. env.adminUserIds หรือตาราง admins — คนนั้นต้องเป็นผู้ดูแล
 *      (ไม่งั้นลูกค้าทุกคนที่มี LINE ก็เปิดหน้านี้ได้)
 *
 * test นี้มีเพราะ route ที่เพิ่มทีหลังคือ route ที่คนลืมใส่ด่าน
 */
/**
 * สาม route ของการล็อกอินเอง เป็นข้อยกเว้นเดียวที่ไม่ผ่าน requireAdmin
 * — มันคือประตู ไม่ใช่ห้องที่อยู่หลังประตู
 * ต้องเขียนชื่อไว้ตรงนี้ทีละอัน เพื่อให้การเพิ่มข้อยกเว้นใหม่เป็นเรื่องที่ต้องตั้งใจทำ
 */
const AUTH_ROUTES = ['login', 'callback', 'logout'];
const isAuthRoute = (f: string) => AUTH_ROUTES.includes(path.basename(path.dirname(f)));
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
    if (isAuthRoute(f)) {
      // ประตูห้ามหยิบข้อมูลของใครออกมา หน้าที่มันคือพาไปล็อกอินแล้วออกบัตรเท่านั้น
      assert.ok(!src.includes("@/lib/db/"), `${rel} เป็น route ล็อกอินแต่แตะฐานข้อมูล`);
      continue;
    }
    // ต้องผ่านด่านกลางเสมอ — ห้ามเช็คสิทธิ์เองทีละ route
    // ด่านที่เขียนซ้ำหลายที่ คือด่านที่วันหนึ่งจะมีที่หนึ่งเช็คไม่ครบ
    assert.match(src, /requireAdmin/, `${rel} ไม่ได้ผ่าน requireAdmin`);
  }
});

/**
 * 401 กับ 403 ต้องแยกจากกัน
 *
 * เคยรวมเป็น 403 เหมือนกันหมด ผลคือคนที่แค่ยังไม่ได้ล็อกอิน
 * ถูกบอกว่า "ไม่ใช่ผู้ดูแลระบบ" แล้วเสียเวลาไปไล่หาสิทธิ์ที่ไม่ได้เสียเลย
 * ข้อความที่บอกสาเหตุผิด แพงกว่าไม่มีข้อความ
 */
test('ด่านต้องแยก "ไม่รู้ว่าเป็นใคร" ออกจาก "ไม่ใช่ผู้ดูแล"', () => {
  const auth = fs.readFileSync(
    path.resolve(import.meta.dirname, '..', 'src', 'lib', 'admin', 'auth.ts'), 'utf8');
  assert.match(auth, /status: 401/, 'ไม่มีทาง 401 เลย');
  assert.match(auth, /status: 403/, 'ไม่มีทาง 403 เลย');

  // การจัดการตัวตนอยู่ใน Shell ที่เดียว — ทุกหน้าหลังบ้านต้องผ่านมัน
  const shell = fs.readFileSync(
    path.resolve(import.meta.dirname, '..', 'src', 'app', 'admin', 'Shell.tsx'), 'utf8');
  assert.ok(
    shell.includes('res.status === 401') && shell.includes('/api/admin/login'),
    'เจอ 401 แล้วต้องพาไปล็อกอิน',
  );
  assert.ok(shell.includes('res.status === 403'), 'ต้องแยก 403 ออกมาบอกว่าไม่ใช่ผู้ดูแล');
});

/**
 * ทุกหน้าใต้ /admin ต้องผ่าน Shell
 *
 * หน้าที่โหลดข้อมูลเอง คือหน้าที่วันหนึ่งจะลืมจัดการ 401
 * แล้วขึ้นหน้าเปล่าให้คนที่แค่ยังไม่ได้ล็อกอิน
 */
test('ทุกหน้าหลังบ้านต้องใช้ Shell ตัวเดียวกัน', () => {
  const dir = path.resolve(import.meta.dirname, '..', 'src', 'app', 'admin');
  const walk = (d: string, out: string[] = []): string[] => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full, out);
      else if (e.name === 'page.tsx') out.push(full);
    }
    return out;
  };
  const pages = walk(dir);
  assert.ok(pages.length >= 3, 'หน้าหลังบ้านหายไป');
  for (const f of pages) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(path.resolve(import.meta.dirname, '..'), f);
    assert.match(src, /useAdmin/, `${rel} โหลดข้อมูลเองโดยไม่ผ่าน Shell`);
  }
});

/**
 * หน้าหลังบ้านต้องเปิดบนคอมได้ จึงห้ามพึ่ง LIFF SDK ซึ่งทำงานได้เฉพาะในแอป LINE
 * ความพังของแบบเดิมคือเงียบ — หน้าเปิดได้ แต่ไม่มี token แล้วไปโผล่เป็น 403
 */
test('หน้าหลังบ้านต้องไม่เรียก LIFF SDK', () => {
  const page = fs.readFileSync(
    path.resolve(import.meta.dirname, '..', 'src', 'app', 'admin', 'page.tsx'), 'utf8');
  for (const bad of ['liff.init', 'getIDToken', 'static.line-scdn.net']) {
    assert.ok(!page.includes(bad), `หน้าหลังบ้านยังเรียก ${bad} อยู่`);
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
