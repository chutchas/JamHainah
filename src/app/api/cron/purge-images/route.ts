/**
 * PDPA — ลบรูปต้นฉบับที่เลย image_purge_after (ตั้งไว้ 30 วันตอนบันทึก)
 *
 * ประหยัด storage มหาศาลตอนสเกล ลดความเสียหายถ้าข้อมูลรั่ว
 * และกลายเป็นจุดขายที่คู่แข่งซึ่งเก็บรูปไว้พูดไม่ได้:
 *   "เราไม่เก็บรูปเอกสารของคุณ"
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { todayInBangkok } from '@/lib/domain/thaiDate';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${env.cronSecret}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const supabase = db();
  const today = todayInBangkok();

  const { data } = await supabase
    .from('documents')
    .select('id, image_path')
    .not('image_path', 'is', null)
    .lte('image_purge_after', today)
    .limit(1000);

  const rows = (data ?? []) as Array<{ id: string; image_path: string }>;
  for (const r of rows) {
    try {
      await supabase.storage.from('documents').remove([r.image_path]);
    } catch {
      // ไฟล์อาจถูกลบไปแล้ว — ไม่เป็นไร ล้าง reference ต่อ
    }
    await supabase.from('documents').update({ image_path: null, image_purge_after: null }).eq('id', r.id);
  }
  return NextResponse.json({ purged: rows.length, today });
}
