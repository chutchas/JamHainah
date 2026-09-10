/**
 * ข้อมูลสำหรับหน้า "รายการของฉัน"
 *
 * ไม่มีระบบสมาชิก ไม่มีรหัสผ่าน — ยืนยันตัวตนด้วย LINE idToken อย่างเดียว
 * LIFF ไม่คุยกับ Supabase ตรง ๆ (RLS ปิดทุกอย่างไว้) ต้องผ่านที่นี่เสมอ
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyLiffIdToken } from '@/lib/line/client';
import { env } from '@/lib/env';
import * as repo from '@/lib/db/repo';
import { docType } from '@/lib/domain/docTypes';
import { formatThai, daysBetween, todayInBangkok } from '@/lib/domain/thaiDate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authenticate(req: NextRequest): Promise<string | null> {
  const idToken = req.headers.get('x-liff-id-token');
  if (!idToken) return null;
  // env.line.loginChannelId โยน error ถ้าไม่ได้ตั้งค่า — ดีกว่าคืน 401 เงียบ ๆ
  // แล้วปล่อยให้ไล่หาสาเหตุเองว่าทำไมหน้ารายการเปิดไม่ได้
  return verifyLiffIdToken(idToken, env.line.loginChannelId);
}

export async function GET(req: NextRequest) {
  const userId = await authenticate(req);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const today = todayInBangkok();
  const docs = await repo.listDocuments(userId);

  return NextResponse.json({
    today,
    documents: docs.map((d) => {
      const t = docType(d.doc_type);
      const days = daysBetween(today, d.expiry_date);
      return {
        id: d.id,
        emoji: t.emoji,
        typeLabel: t.label,
        label: d.label,
        expiry: d.expiry_date,
        expiryThai: formatThai(d.expiry_date),
        days,
        status: days < 0 ? 'overdue' : days <= 30 ? 'soon' : days <= 90 ? 'watch' : 'ok',
        confirmed: d.confirmed_by_user,
      };
    }),
  });
}

/** ลบเอกสารรายใบ หรือลบข้อมูลทั้งหมด (PDPA) — ต้องทำงานได้จริงตั้งแต่ v1 */
export async function DELETE(req: NextRequest) {
  const userId = await authenticate(req);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id === 'all') {
    await repo.hardDeleteUser(userId);
    await repo.track('data_deleted', userId, { via: 'liff' });
    return NextResponse.json({ ok: true, deleted: 'all' });
  }
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const doc = await repo.getDocument(id);
  if (!doc || doc.line_user_id !== userId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  await repo.archiveDocument(id);
  return NextResponse.json({ ok: true });
}
