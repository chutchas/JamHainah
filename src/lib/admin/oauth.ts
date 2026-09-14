/**
 * ของที่ขาไปกับขากลับต้องใช้ร่วมกัน
 *
 * อยู่ที่นี่ไม่ใช่ในไฟล์ route เพราะ Next.js ยอมให้ route export ได้เฉพาะชื่อที่มันรู้จัก
 * (GET, POST, runtime, dynamic …) การ export อย่างอื่นจะพังตอน build ไม่ใช่ตอนเขียน
 */
import { env } from '@/lib/env';

export const STATE_COOKIE = 'jh_state';

/**
 * ที่อยู่ขากลับ ต้องตรงกับที่ลงทะเบียนไว้ในคอนโซล LINE แบบตัวต่อตัว
 * จึงอ่านจาก env ไม่ใช่จาก header ของ request — host ที่ browser ส่งมา ปลอมได้
 */
export function callbackUrl(): string {
  if (!env.baseUrl) throw new Error('ยังไม่ได้ตั้ง NEXT_PUBLIC_BASE_URL');
  return `${env.baseUrl}/api/admin/callback`;
}
