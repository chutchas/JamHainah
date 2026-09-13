/**
 * ด่านเข้าหน้าหลังบ้าน — ที่เดียวในระบบที่ตัดสินว่าใครเป็นผู้ดูแล
 *
 * สองชั้นเสมอ:
 *   1. idToken ต้องผ่านการตรวจกับเซิร์ฟเวอร์ของ LINE (ปลอม header มาเองไม่ได้)
 *   2. user id ที่ได้ ต้องเป็น bootstrap owner จาก env หรืออยู่ในตาราง admins
 *
 * ทำไม env ยังอยู่ทั้งที่มีตารางแล้ว: ตารางว่าง = ไม่มีใครเข้าได้เลย
 * รวมถึงคนที่จะไปเพิ่มแถวแรก — env คือทางกลับเข้าบ้านเมื่อเผลอถอดสิทธิ์ตัวเอง
 */
import { NextRequest } from 'next/server';
import { authenticateLiff } from '@/lib/line/liffAuth';
import { env } from '@/lib/env';
import * as repo from '@/lib/db/repo';

export interface AdminIdentity {
  userId: string;
  role: 'owner' | 'staff';
  /** มาจาก env ไม่ใช่จากตาราง — ถอดสิทธิ์ผ่านหน้าเว็บไม่ได้ */
  bootstrap: boolean;
}

export async function requireAdmin(req: NextRequest): Promise<AdminIdentity | null> {
  const userId = await authenticateLiff(req);
  if (!userId) return null;

  if (env.adminUserIds.includes(userId)) {
    return { userId, role: 'owner', bootstrap: true };
  }

  const row = await repo.findAdmin(userId);
  if (!row || row.disabled_at) return null;
  return { userId, role: row.role, bootstrap: false };
}

/** งานที่แตะสิทธิ์คนอื่น ต้องเป็น owner เท่านั้น */
export function isOwner(who: AdminIdentity): boolean {
  return who.role === 'owner';
}
