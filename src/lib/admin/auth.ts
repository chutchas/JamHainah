/**
 * ด่านเข้าหน้าหลังบ้าน — ที่เดียวในระบบที่ตัดสินว่าใครเป็นผู้ดูแล
 *
 * สองชั้นเสมอ:
 *   1. ต้องรู้ก่อนว่าเป็นใคร — จากคุกกี้ที่เราเซ็นเอง หรือ idToken ของ LIFF
 *   2. คนนั้นต้องเป็น bootstrap owner จาก env หรืออยู่ในตาราง admins
 *
 * และต้อง "แยกสองชั้นนี้ออกจากกันตอนตอบกลับ" ด้วย:
 *   401 = ไม่รู้ว่าคุณเป็นใคร  → พาไปล็อกอิน
 *   403 = รู้ว่าคุณเป็นใคร แต่ไม่ใช่ผู้ดูแล → บอกตรง ๆ ว่าไม่มีสิทธิ์
 * เคยรวมสองอย่างนี้เป็น 403 เหมือนกัน ผลคือคนที่ยังไม่ได้ล็อกอิน
 * ถูกบอกว่า "ไม่ใช่ผู้ดูแลระบบ" แล้วไปนั่งแก้สิทธิ์ที่ไม่ได้เสีย
 *
 * ทำไม env ยังอยู่ทั้งที่มีตารางแล้ว: ตารางว่าง = ไม่มีใครเข้าได้เลย
 * รวมถึงคนที่จะไปเพิ่มแถวแรก — env คือทางกลับเข้าบ้านเมื่อเผลอถอดสิทธิ์ตัวเอง
 */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateLiff } from '@/lib/line/liffAuth';
import { ADMIN_COOKIE, readSession } from '@/lib/admin/session';
import { env } from '@/lib/env';
import * as repo from '@/lib/db/repo';

export interface AdminIdentity {
  userId: string;
  role: 'owner' | 'staff';
  /** มาจาก env ไม่ใช่จากตาราง — ถอดสิทธิ์ผ่านหน้าเว็บไม่ได้ */
  bootstrap: boolean;
}

export type AdminGate =
  | { ok: true; who: AdminIdentity }
  | { ok: false; status: 401 | 403 };

/**
 * รู้ไหมว่าเป็นใคร
 *
 * คุกกี้มาก่อน เพราะเป็นทางที่ใช้จริงทั้งบนคอมและในเบราว์เซอร์ของ LINE
 * ส่วน idToken เก็บไว้เผื่อเปิดจาก LIFF โดยตรง — ไม่มีต้นทุนที่จะรองรับทั้งคู่
 */
async function identify(req: NextRequest): Promise<string | null> {
  const fromCookie = readSession(req.cookies.get(ADMIN_COOKIE)?.value);
  if (fromCookie) return fromCookie;
  return authenticateLiff(req);
}

export async function requireAdmin(req: NextRequest): Promise<AdminGate> {
  const userId = await identify(req);
  if (!userId) return { ok: false, status: 401 };

  if (env.adminUserIds.includes(userId)) {
    return { ok: true, who: { userId, role: 'owner', bootstrap: true } };
  }

  const row = await repo.findAdmin(userId);
  if (!row || row.disabled_at) return { ok: false, status: 403 };
  return { ok: true, who: { userId, role: row.role, bootstrap: false } };
}

/** คำตอบมาตรฐานของด่าน — ให้ทุก route พูดเหมือนกัน */
export function denied(status: 401 | 403) {
  return NextResponse.json(
    { error: status === 401 ? 'ยังไม่ได้เข้าสู่ระบบ' : 'บัญชีนี้ไม่ใช่ผู้ดูแลระบบ' },
    { status },
  );
}

/** งานที่แตะสิทธิ์คนอื่น ต้องเป็น owner เท่านั้น */
export function isOwner(who: AdminIdentity): boolean {
  return who.role === 'owner';
}
