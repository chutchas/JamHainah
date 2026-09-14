/**
 * เริ่มเข้าสู่ระบบห้องทำงาน — ส่งต่อไปให้ LINE เป็นคนถามว่าใช่คุณจริงไหม
 *
 * เราไม่มีรหัสผ่านของตัวเอง และไม่ควรมี รหัสผ่านที่เราเก็บเอง
 * คือของที่วันหนึ่งจะหลุด และเป็นภาระที่ไม่ได้ทำให้ระบบปลอดภัยขึ้นเลย
 *
 * state คือเลขสุ่มที่เราฝากไว้ในคุกกี้ก่อนออกเดินทาง แล้วเช็คตอนขากลับ
 * กันคนอื่นยิงลิงก์ callback ปลอมใส่เบราว์เซอร์เรา แล้วพาเราไปล็อกอินเป็นบัญชีของเขา
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { env } from '@/lib/env';
import { cookieOptions } from '@/lib/admin/session';
import { STATE_COOKIE, callbackUrl } from '@/lib/admin/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const state = randomBytes(16).toString('hex');

  const url = new URL('https://access.line.me/oauth2/v2.1/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', env.line.loginChannelId);
  url.searchParams.set('redirect_uri', callbackUrl());
  url.searchParams.set('state', state);
  // openid = ขอ id_token กลับมาด้วย ไม่มี scope นี้จะได้แต่ token ที่บอกไม่ได้ว่าเป็นใคร
  url.searchParams.set('scope', 'openid profile');

  const res = NextResponse.redirect(url.toString());
  // อายุสั้นมาก — ใช้ครั้งเดียวระหว่างเดินทางไปกลับเท่านั้น
  res.cookies.set(STATE_COOKIE, state, cookieOptions(600));
  return res;
}
