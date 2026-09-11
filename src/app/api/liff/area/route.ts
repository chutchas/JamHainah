/**
 * ผู้ใช้กดอนุญาตให้เว็บอ่านตำแหน่ง — เก็บไว้แบบหยาบ
 *
 * ทำไมย้ายมาเก็บที่นี่แทนการขอพิกัดในแชท:
 *   ในแชท LINE เปิดได้แค่หน้า "เลือกสถานที่" ซึ่งไม่รับคำค้นของเรา
 *   ผู้ใช้ต้องกดหลายที กว่าจะได้พิกัด และได้ของที่ไม่ตรงกับที่เขาคาด
 *   ส่วนในหน้าเว็บ ขอครั้งเดียว เบราว์เซอร์จำให้ และเราเอาไปปักหมุดลิงก์แผนที่ได้เลย
 *
 * เก็บแค่ทศนิยม 2 ตำแหน่ง (~1 กม.) — พอให้รู้ว่าลูกค้ากระจุกโซนไหน
 * เพื่อไปหาร้านแถวนั้นมาเป็นพาร์ทเนอร์ ไม่ได้ต้องการรู้ว่าใครอยู่บ้านเลขที่ไหน
 */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateLiff } from '@/lib/line/liffAuth';
import * as repo from '@/lib/db/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const userId = await authenticateLiff(req);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { lat, lng } = (await req.json()) as { lat?: number; lng?: number };
  if (
    typeof lat !== 'number' || typeof lng !== 'number' ||
    !Number.isFinite(lat) || !Number.isFinite(lng) ||
    Math.abs(lat) > 90 || Math.abs(lng) > 180
  ) {
    return NextResponse.json({ error: 'bad coords' }, { status: 400 });
  }

  await repo.saveUserArea(userId, { lat, lng });
  await repo.track('area_shared', userId, { via: 'liff' });

  // คืนค่าที่ปัดแล้ว เพื่อให้หน้าเว็บใช้ค่าเดียวกับที่เราเก็บจริง
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return NextResponse.json({ ok: true, lat: round2(lat), lng: round2(lng) });
}
