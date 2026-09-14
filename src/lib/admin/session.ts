/**
 * บัตรผ่านหลังบ้าน — คุกกี้ที่เราเซ็นเอง ไม่ใช่ session ที่เก็บในฐานข้อมูล
 *
 * ทำไมไม่เก็บลงตาราง: หลังบ้านมีคนใช้ไม่กี่คน การอ่านฐานข้อมูลทุก request
 * เพื่อยืนยันคนเดิมซ้ำ ๆ คือราคาที่จ่ายไปโดยไม่ได้อะไรกลับมา
 * แลกกับข้อเสียที่ต้องรับให้ได้: ถอดสิทธิ์ใครแล้วบัตรใบเดิมยังใช้ได้จนหมดอายุ
 * — จึงตั้งอายุไว้สั้น และ requireAdmin ยังไปเช็ค allowlist ทุกครั้งอยู่ดี
 *
 * รูปแบบ:  <payload ที่ base64url>.<ลายเซ็น>
 * payload: <line user id>.<เวลาหมดอายุเป็น ms>
 *
 * ลายเซ็นคือสิ่งเดียวที่กันไม่ให้ใครแก้ user id ในคุกกี้เป็นของคนอื่น
 * จึงเทียบแบบ timingSafeEqual เสมอ ห้ามใช้ === ธรรมดา
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

export const ADMIN_COOKIE = 'jh_admin';

/**
 * 8 ชั่วโมง — ยาวพอให้ทำงานทั้งวันโดยไม่ต้องล็อกอินซ้ำ
 * และสั้นพอให้เครื่องที่ลืมล็อกเอาต์ที่ร้านกาแฟ หมดอายุก่อนกลับถึงบ้าน
 */
const TTL_MS = 8 * 60 * 60 * 1000;

function sign(payload: string): string {
  return createHmac('sha256', env.adminSessionSecret).update(payload).digest('base64url');
}

export function issueSession(userId: string, now = Date.now()): string {
  const payload = `${userId}.${now + TTL_MS}`;
  return `${Buffer.from(payload, 'utf8').toString('base64url')}.${sign(payload)}`;
}

/** คืน user id ถ้าบัตรยังใช้ได้ · คืน null ทุกกรณีที่เหลือ โดยไม่บอกว่าเพราะอะไร */
export function readSession(cookie: string | undefined, now = Date.now()): string | null {
  if (!cookie) return null;
  const dot = cookie.lastIndexOf('.');
  if (dot <= 0) return null;

  let payload: string;
  try {
    payload = Buffer.from(cookie.slice(0, dot), 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const given = Buffer.from(cookie.slice(dot + 1));
  const want = Buffer.from(sign(payload));
  // ยาวไม่เท่ากัน timingSafeEqual จะโยน error — เช็คก่อน แล้วค่อยเทียบ
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  const cut = payload.lastIndexOf('.');
  if (cut <= 0) return null;
  const expires = Number(payload.slice(cut + 1));
  if (!Number.isFinite(expires) || expires <= now) return null;

  return payload.slice(0, cut) || null;
}

/**
 * httpOnly  — สคริปต์ในหน้าเว็บอ่านไม่ได้ ต่อให้มีโค้ดแปลกปลอมหลุดเข้ามา
 * secure    — ไม่ถูกส่งผ่าน http ธรรมดา (ยกเว้นตอน dev ที่ยังไม่มี https)
 * sameSite  — lax เพราะขากลับจากหน้า LINE เป็นการข้ามเว็บมา ถ้าใช้ strict คุกกี้จะไม่ติดมาด้วย
 */
export function cookieOptions(maxAgeSeconds = TTL_MS / 1000) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
