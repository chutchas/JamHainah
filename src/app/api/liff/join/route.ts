/**
 * QR ที่เคาน์เตอร์ร้านชี้มาที่ LIFF พร้อม ?shop=<code>
 *
 * ทำไมต้องผ่าน LIFF: follow event ของ LINE ไม่บอกว่าผู้ใช้มาจากไหน
 * แต่ LIFF รู้ line_user_id ได้ตั้งแต่ก่อนเขากด Add เพื่อน
 * จึงบันทึกไว้ก่อน แล้วตอน follow ค่อยจับคู่ย้อนหลัง (repo.attachShopAttribution)
 *
 * หมายเหตุ: ตัวเลขที่ได้จากตรงนี้มีไว้ "ขาย" ไม่ได้มีไว้ "เก็บเงิน"
 * ขา A (ลูกค้าเดินกลับไปเอง) พิสูจน์ไม่ได้จึงเรียกส่วนแบ่งไม่ได้
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { verifyLiffIdToken } from '@/lib/line/client';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { idToken, shopCode } = (await req.json()) as { idToken?: string; shopCode?: string };
  if (!idToken || !shopCode) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const lineUserId = await verifyLiffIdToken(idToken, env.line.loginChannelId);
  if (!lineUserId) return NextResponse.json({ ok: false }, { status: 401 });

  const supabase = db();
  const { data: shop } = await supabase.from('shops').select('id').eq('code', shopCode).maybeSingle();
  if (!shop) return NextResponse.json({ ok: false, reason: 'unknown_shop' }, { status: 404 });

  await supabase.from('shop_scans').insert({ line_user_id: lineUserId, shop_id: shop.id });
  return NextResponse.json({ ok: true });
}
