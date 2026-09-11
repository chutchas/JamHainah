/**
 * ยืนยันตัวตนของทุก endpoint ที่ LIFF เรียก
 *
 * ไม่มีระบบสมาชิก ไม่มีรหัสผ่าน — idToken จาก LINE คือหลักฐานชิ้นเดียวที่เรามี
 * และต้องตรวจกับเซิร์ฟเวอร์ของ LINE ทุกครั้ง ห้ามเชื่อค่าที่ browser ส่งมาเฉย ๆ
 */
import { NextRequest } from 'next/server';
import { verifyLiffIdToken } from '@/lib/line/client';
import { env } from '@/lib/env';

export async function authenticateLiff(req: NextRequest): Promise<string | null> {
  const idToken = req.headers.get('x-liff-id-token');
  if (!idToken) return null;
  // env.line.loginChannelId โยน error ถ้าไม่ได้ตั้งค่า — ดีกว่าคืน 401 เงียบ ๆ
  // แล้วปล่อยให้ไล่หาสาเหตุเองว่าทำไมหน้ารายการเปิดไม่ได้
  return verifyLiffIdToken(idToken, env.line.loginChannelId);
}
