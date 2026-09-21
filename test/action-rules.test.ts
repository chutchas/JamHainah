/**
 * กติกาของปุ่มต่ออายุที่แก้ได้จากห้องทำงาน
 *
 * ป้ายปุ่มไปอยู่ใน quick reply ของ LINE — ยาวเกิน 20 ตัว LINE ปฏิเสธทั้งข้อความ
 * แปลว่าแก้ป้ายผิดหนึ่งปุ่ม ลูกค้าทุกคนที่มีเอกสารประเภทนั้นจะไม่ได้รับการเตือนเลย
 * และจะไม่มีใครรู้จนกว่าจะมีคนมาถามว่าทำไมเงียบ
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkLabel, checkUrl, checkSearchTerm, LABEL_MAX } from '../src/lib/domain/actionRules';
import { DEFAULT_RENEW_ACTIONS } from '../src/lib/domain/renewActions';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

test('ป้ายที่ยาวเกิน ว่าง หรือมี emoji ต้องไม่ผ่าน', () => {
  assert.equal(checkLabel('ต่อภาษีออนไลน์'), null);
  assert.ok(checkLabel(''));
  assert.ok(checkLabel('   '));
  assert.ok(checkLabel('ก'.repeat(LABEL_MAX + 1)));
  assert.equal(checkLabel('ก'.repeat(LABEL_MAX)), null);
  assert.ok(checkLabel('🌐 ต่อภาษีออนไลน์'), 'emoji หลุดผ่านมาได้');
});

test('ปุ่มตั้งต้นทุกอันต้องผ่านกติกาเดียวกับที่ห้องทำงานใช้', () => {
  for (const [doc, list] of Object.entries(DEFAULT_RENEW_ACTIONS)) {
    for (const a of list) {
      assert.equal(checkLabel(a.label), null, `${doc}: ${a.label}`);
      if (a.url) assert.equal(checkUrl(a.url), null, `${doc}: ${a.url}`);
      if (a.searchTerm) assert.equal(checkSearchTerm(a.searchTerm), null, `${doc}: ${a.searchTerm}`);
    }
  }
});

test('ลิงก์ต้องเป็น https — http เปิดในแอป LINE แล้วขึ้นเตือนว่าไม่ปลอดภัย', () => {
  assert.equal(checkUrl('https://eservice.dlt.go.th'), null);
  assert.ok(checkUrl('http://eservice.dlt.go.th'));
  assert.ok(checkUrl('eservice.dlt.go.th'));
  assert.ok(checkUrl('javascript:alert(1)'));
});

test('แก้ปุ่มได้เฉพาะหัวหน้าขึ้นไป และเซิร์ฟเวอร์ต้องตรวจกติกาซ้ำเอง', () => {
  const src = read('src/app/api/admin/links/route.ts');
  assert.match(src, /can\(who, 'content'\)/, 'ไม่มีด่านสิทธิ์ก่อนแก้ปุ่ม');
  assert.match(src, /checkLabel\(/, 'เซิร์ฟเวอร์ไม่ได้ตรวจป้ายปุ่ม');
  assert.match(src, /checkUrl\(/, 'เซิร์ฟเวอร์ไม่ได้ตรวจลิงก์');
  const auth = read('src/lib/admin/auth.ts');
  const content = auth.match(/content:\s*\[([^\]]*)\]/)?.[1] ?? '';
  assert.ok(!content.includes('staff'), 'พนักงานแก้ปุ่มได้');
});

/**
 * ปุ่มตรวจต้องเปิดเฉพาะลิงก์ที่เก็บในฐานข้อมูล
 * ถ้ารับ url จากคนกด เซิร์ฟเวอร์เราจะกลายเป็นเครื่องมือเปิดที่ไหนก็ได้ตามที่ใครส่งมา
 */
test('ปุ่มตรวจลิงก์ไม่รับ url จากคนกด', () => {
  const src = read('src/app/api/admin/links/route.ts');
  assert.match(src, /probe\(before\.url\)/);
  assert.ok(!/probe\(body\./.test(src), 'ปุ่มตรวจเอา url จาก request ไปเปิด');
});

/**
 * ยืนยันเองต้องลงประวัติแยกจากการตรวจอัตโนมัติ
 * ไม่งั้นย้อนดูไม่ได้ว่าวันที่ "ตรวจแล้ว" มาจากเครื่องหรือมาจากคนกด
 */
test('การยืนยันลิงก์ด้วยมือต้องบันทึกแยกและไม่เปิดเว็บเอง', () => {
  const src = read('src/app/api/admin/links/route.ts');
  const confirm = src.slice(src.indexOf("body.op === 'confirm'"), src.indexOf('// ---- แก้และเปิดปิด'));
  assert.match(confirm, /link\.verify\.manual/);
  assert.ok(!confirm.includes('probe('), 'ยืนยันเองแต่ไปเปิดเว็บด้วย');
});
