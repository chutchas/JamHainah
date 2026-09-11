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
  return NextResponse.json({ ok: true });
}
