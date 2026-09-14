/**
 * ออกจากระบบ — ลบบัตรผ่านทิ้ง
 *
 * ไม่พากลับไป /admin เฉย ๆ เพราะหน้านั้นจะเด้งไปล็อกอินใหม่ทันที
 * กลายเป็นว่ากดออกแล้วเข้าเองอีกรอบ ซึ่งไม่ใช่สิ่งที่คนกดต้องการ
 */
import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, cookieOptions } from '@/lib/admin/session';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const res = NextResponse.redirect(`${env.baseUrl}/admin?e=bye`);
  res.cookies.set(ADMIN_COOKIE, '', cookieOptions(0));
  return res;
}
