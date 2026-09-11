/**
 * ข้อมูลสำหรับหน้า "รายการของฉัน"
 *
 * ไม่มีระบบสมาชิก ไม่มีรหัสผ่าน — ยืนยันตัวตนด้วย LINE idToken อย่างเดียว
 * LIFF ไม่คุยกับ Supabase ตรง ๆ (RLS ปิดทุกอย่างไว้) ต้องผ่านที่นี่เสมอ
 */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateLiff as authenticate } from '@/lib/line/liffAuth';
import * as repo from '@/lib/db/repo';
import { docType } from '@/lib/domain/docTypes';
import { formatThai, daysBetween, todayInBangkok } from '@/lib/domain/thaiDate';
import { loadRenewActions, mapsSearchUrl } from '@/lib/domain/renewActions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ปุ่ม "แล้วต้องไปทำที่ไหน" ที่ส่งให้หน้าเว็บ — รูปร่างเดียวกับที่ page.tsx รับ */
interface DocAction {
  kind: 'upsell' | 'link' | 'map';
  label: string;
  url?: string;
  term?: string;
}

export async function GET(req: NextRequest) {
  const userId = await authenticate(req);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const today = todayInBangkok();
  const [docs, actionsByType, area] = await Promise.all([
    repo.listDocuments(userId),
    loadRenewActions(),
    repo.getUserArea(userId),
  ]);

  return NextResponse.json({
    today,
    /** มีพิกัดแล้วหรือยัง — หน้าเว็บใช้ตัดสินใจว่าจะชวนเปิดตำแหน่งไหม */
    hasArea: area !== null,
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
        /**
         * "เหลือกี่วัน" อย่างเดียวไม่พอ — รู้ว่าเหลือ 12 วันแล้วต้องไปทำอะไรต่อ
         * ปุ่มชุดนี้คือคำตอบ และมาจากตาราง renew_actions ชุดเดียวกับที่ใช้ในแชท
         * จะได้ไม่มีวันที่แชทบอกอย่าง หน้าเว็บบอกอีกอย่าง
         */
        actions: (actionsByType[d.doc_type] ?? []).slice(0, 4).flatMap((a): DocAction[] => {
          if (a.kind === 'upsell') return [{ kind: 'upsell', label: a.label }];
          if (a.kind === 'link' && a.url) return [{ kind: 'link', label: a.label, url: a.url }];
          if (a.kind === 'location' && a.searchTerm) {
            // มีพิกัดก็ปักหมุดให้ ไม่มีก็ยังกดได้ — Google Maps ใช้ตำแหน่งของเครื่องเอง
            return [{
              kind: 'map', label: a.label, term: a.searchTerm,
              url: mapsSearchUrl(a.searchTerm, area?.lat, area?.lng),
            }];
          }
          return [];
        }),
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
