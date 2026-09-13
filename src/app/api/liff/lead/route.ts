/**
 * "ให้เราต่อให้" จากหน้ารายการ
 *
 * ยังไม่มีระบบรับงานอัตโนมัติ และไม่ควรมีในวันแรกด้วย
 * สิ่งที่ต้องรู้ก่อนคือมีคนกดกี่คน เอกสารประเภทไหน — ตัวเลขนี้คือสิ่งที่ใช้ไปคุยกับร้าน
 *
 * จึงบันทึกเป็น lead แล้วให้คนทักกลับ ไม่ push กลับทันที (push ใบละ ฿0.06
 * และไฟล์เดียวที่ push ได้คือ src/lib/reminders/run.ts)
 */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateLiff } from '@/lib/line/liffAuth';
import * as repo from '@/lib/db/repo';
import { getProfile } from '@/lib/line/client';
import { notifyAdmin } from '@/lib/line/admin';
import { leadAlert } from '@/lib/line/messages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const userId = await authenticateLiff(req);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { documentId } = (await req.json()) as { documentId?: string };
  if (!documentId) return NextResponse.json({ error: 'missing documentId' }, { status: 400 });

  const doc = await repo.getDocument(documentId);
  if (!doc || doc.line_user_id !== userId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  await repo.track('upsell_clicked', userId, {
    typeKey: doc.doc_type, documentId, via: 'liff',
  });

  // งานเข้าต้องดังทันที — ที่เหลือคือความเร็วในการทักกลับ ซึ่งเป็นสินค้าจริงของขาบริการ
  const profile = await getProfile(userId);
  await notifyAdmin(
    leadAlert({
      displayName: profile?.displayName, lineUserId: userId,
      typeKey: doc.doc_type, label: doc.label, expiry: doc.expiry_date, via: 'web',
    })
  );
  return NextResponse.json({ ok: true });
}
