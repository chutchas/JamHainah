/**
 * กติกาของปุ่มต่ออายุ — ใช้ตรวจก่อนบันทึกจากห้องทำงาน
 *
 * ไฟล์นี้ไม่แตะฐานข้อมูล เพื่อให้หน้าเว็บ import ไปเตือนก่อนกดบันทึกได้
 * และเซิร์ฟเวอร์ใช้กติกาชุดเดียวกันตรวจซ้ำอีกรอบ (หน้าเว็บโกงได้ เซิร์ฟเวอร์ห้ามเชื่อ)
 *
 * ทำไมต้องเข้มขนาดนี้: ป้ายปุ่มนี้ไปอยู่ใน quick reply ของ LINE
 * ถ้ายาวเกิน 20 ตัว LINE ปฏิเสธ "ทั้งข้อความ" ไม่ใช่แค่ปุ่มนั้น
 * แปลว่าแก้ป้ายผิดหนึ่งปุ่ม ลูกค้าทุกคนที่มีเอกสารประเภทนั้นจะไม่ได้รับการเตือนเลย
 */

export const LABEL_MAX = 20;

/** ช่วงเดียวกับที่เทสต์ข้อความใช้ — emoji ถูกวาดโดยเครื่องลูกค้า หน้าตาคุมไม่ได้ */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

export const ACTION_KIND_TH: Record<string, string> = {
  link: 'เว็บไซต์',
  location: 'ค้นในแผนที่',
  upsell: 'ให้เราทำให้',
};

/** คืนข้อความบอกว่าผิดตรงไหน · null = ใช้ได้ */
export function checkLabel(label: string): string | null {
  const t = label.trim();
  if (!t) return 'ป้ายปุ่มว่างไม่ได้';
  // นับแบบที่ LINE นับ — ตัวอักษรไทยที่มีวรรณยุกต์ นับแยกตัว
  if ([...t].length > LABEL_MAX) return `ป้ายปุ่มยาวเกิน ${LABEL_MAX} ตัว (ตอนนี้ ${[...t].length})`;
  if (EMOJI.test(t)) return 'ป้ายปุ่มห้ามมี emoji';
  return null;
}

export function checkUrl(url: string): string | null {
  let u: URL;
  try { u = new URL(url.trim()); } catch { return 'ลิงก์ไม่ถูกรูปแบบ'; }
  // http เปิดในแอป LINE แล้วขึ้นเตือนว่าไม่ปลอดภัย ลูกค้าจะไม่กล้ากดต่อ
  if (u.protocol !== 'https:') return 'ลิงก์ต้องขึ้นต้นด้วย https://';
  return null;
}

export function checkSearchTerm(term: string): string | null {
  const t = term.trim();
  if (!t) return 'คำค้นว่างไม่ได้';
  if (t.length > 60) return 'คำค้นยาวเกินไป';
  return null;
}
