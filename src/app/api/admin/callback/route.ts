/**
 * ขากลับจากหน้า LINE — แลกตั๋วชั่วคราวเป็นบัตรผ่านของเรา
 *
 * ลำดับสำคัญ และห้ามสลับ:
 *   1. เช็ค state ก่อนแตะอย่างอื่น — ถ้าไม่ตรง แปลว่าไม่ได้ออกเดินทางจากเครื่องนี้
 *   2. แลก code กับ LINE ด้วย channel secret (ทำฝั่งเซิร์ฟเวอร์เท่านั้น)
 *   3. ตรวจ id_token กับ LINE อีกรอบ ไม่ถอดรหัสอ่านเอง
 *
 * ที่นี่ไม่ตัดสินว่าใครเป็นผู้ดูแล — ออกบัตรที่บอกแค่ว่า "คุณคือ user คนนี้"
 * เรื่องสิทธิ์ปล่อยให้ requireAdmin ตัดสินทุก request เหมือนเดิม
 * ถ้าเอามาตัดสินตรงนี้ด้วย จะมีสองที่ที่รู้กติกาสิทธิ์ แล้ววันหนึ่งจะไม่ตรงกัน
 */
import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { verifyLiffIdToken } from '@/lib/line/client';
import { ADMIN_COOKIE, cookieOptions, issueSession } from '@/lib/admin/session';
import { STATE_COOKIE, callbackUrl } from '@/lib/admin/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** พากลับไปหน้าห้องทำงานพร้อมรหัสปัญหา — หน้าเว็บเป็นคนแปลเป็นภาษาคน */
function back(reason: string) {
  const res = NextResponse.redirect(`${env.baseUrl}/admin?e=${reason}`);
  res.cookies.set(STATE_COOKIE, '', cookieOptions(0));
  return res;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const expected = req.cookies.get(STATE_COOKIE)?.value;

  // ผู้ใช้กดยกเลิกที่หน้า LINE ก็มาทางนี้ — ไม่ใช่ความผิดพลาด บอกให้ตรง
  if (req.nextUrl.searchParams.get('error')) return back('cancelled');
  if (!code || !state || !expected || state !== expected) return back('state');

  const token = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl(),
      client_id: env.line.loginChannelId,
      client_secret: env.line.loginChannelSecret,
    }),
  });
  if (!token.ok) return back('exchange');

  const data = (await token.json()) as { id_token?: string };
  if (!data.id_token) return back('exchange');

  const userId = await verifyLiffIdToken(data.id_token, env.line.loginChannelId);
  if (!userId) return back('verify');

  // ok=1 บอกหน้าเว็บว่าเพิ่งผ่านการล็อกอินมาสด ๆ
  // ถ้ายังโดน 401 อีก แปลว่าคุกกี้ไม่ถูกเก็บ ไม่ใช่ยังไม่ได้ล็อกอิน — จะได้ไม่วนลูป
  const res = NextResponse.redirect(`${env.baseUrl}/admin?ok=1`);
  res.cookies.set(ADMIN_COOKIE, issueSession(userId), cookieOptions());
  res.cookies.set(STATE_COOKIE, '', cookieOptions(0));
  return res;
}
