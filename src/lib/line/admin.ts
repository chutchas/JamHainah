/**
 * ช่องทางเดียวที่ push หาเจ้าของระบบได้
 *
 * กฎข้อ 3 ของโปรเจกต์นี้คือ "ผู้ใช้ทักก่อน = reply (ฟรี) · เรายิงเอง = push (฿0.06)"
 * และมี test บังคับว่าห้ามไฟล์ไหน import push นอกจากที่อนุญาตไว้
 *
 * ไฟล์นี้เป็นข้อยกเว้นที่แคบที่สุดเท่าที่จะแคบได้: ส่งได้เฉพาะหาเจ้าของระบบ
 * ตาม ADMIN_LINE_USER_ID เท่านั้น — ไม่มีพารามิเตอร์ให้ระบุปลายทาง
 * เพราะฟังก์ชันที่รับ userId ได้ คือฟังก์ชันที่วันหนึ่งจะถูกเรียกด้วย userId ของลูกค้า
 *
 * ไม่ตั้งค่าก็ไม่พัง แค่เงียบ — เรื่องภายในบ้านของเราต้องไม่ทำให้ flow ลูกค้าล้ม
 */
import { push } from './client';
import type { LineMessage } from './messages';
import { env } from '@/lib/env';

export async function notifyAdmin(messages: LineMessage[]): Promise<void> {
  const ids = env.adminUserIds;
  if (ids.length === 0 || messages.length === 0) return;

  for (const id of ids) {
    try {
      await push(id, messages);
    } catch (err) {
      // งานหลักจบไปแล้วตอนที่ถึงบรรทัดนี้ — แจ้งไม่ได้ก็ห้ามลากงานหลักล้มตาม
      console.error('[admin] notify failed', err);
    }
  }
}
