/**
 * เคส "ให้เราต่อให้" — รายการทั้งหมด และการเปิดเคสด้วยมือ
 *
 * ก่อนหน้านี้เคสเกิดได้ทางเดียวคือลูกค้ากดปุ่มในไลน์
 * แต่ลูกค้าจริงโทรมา ทักมา หรือเจอกันหน้าร้าน — งานที่จดไม่ได้ คืองานที่หาย
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, denied, can } from '@/lib/admin/auth';
import * as repo from '@/lib/db/repo';
import { db } from '@/lib/db/client';
import { docType } from '@/lib/domain/docTypes';
import { formatThai } from '@/lib/domain/thaiDate';
import { SERVICES, SERVICE_TH } from '@/lib/domain/caseWork';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return denied(gate.status);
  const who = gate.who;
  const seesMoney = can(who, 'money');

  const rows = await repo.listOrders(200);
  const ids = [...new Set(rows.map((r) => r.line_user_id))];
  const { data: people } = ids.length
    ? await db().from('users').select('line_user_id, display_name').in('line_user_id', ids)
    : { data: [] as Array<{ line_user_id: string; display_name: string | null }> };
  const nameBy = new Map((people ?? []).map((p) => [p.line_user_id, p.display_name]));

  return NextResponse.json({
    services: SERVICES.map((s) => ({ key: s, label: SERVICE_TH[s] })),
    seesMoney,
    cases: rows.map((o) => ({
      id: o.id,
      status: o.status,
      service: o.service,
      serviceLabel: SERVICE_TH[o.service] ?? docType(o.service).label,
      name: nameBy.get(o.line_user_id) ?? null,
      lineUserId: o.line_user_id,
      atThai: formatThai(o.created_at.slice(0, 10)),
      note: o.note,
      priceThb: seesMoney ? o.price_thb : null,
      paid: o.paid_at !== null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return denied(gate.status);
  const who = gate.who;

  const body = (await req.json()) as {
    lineUserId?: string; service?: string; note?: string; find?: string;
  };

  // ค้นหาลูกค้าก่อนเปิดเคส — คนละงานกับการสร้าง แต่อยู่ route เดียวกัน
  // เพราะเป็นขั้นตอนเดียวกันในสายตาคนใช้ และยังผ่านด่านเดียวกันอยู่
  if (body.find !== undefined) {
    return NextResponse.json({ found: await repo.searchUsers(body.find) });
  }

  const target = (body.lineUserId ?? '').trim();
  const service = (body.service ?? '').trim();
  if (!/^U[0-9a-f]{32}$/.test(target)) {
    return NextResponse.json({ error: 'ยังไม่ได้เลือกว่าเปิดเคสให้ใคร' }, { status: 400 });
  }
  if (!(SERVICES as readonly string[]).includes(service)) {
    return NextResponse.json({ error: 'ยังไม่ได้เลือกว่าทำเรื่องอะไร' }, { status: 400 });
  }

  /**
   * ลูกค้าต้องเคยทักบอทมาก่อน ไม่งั้นเราไม่มีทางส่งอะไรกลับไปหาเขาได้เลย
   * เปิดเคสให้คนที่ติดต่อกลับไม่ได้ คือการจดไว้เฉย ๆ แล้วลืม
   */
  const { data: exists } = await db()
    .from('users').select('line_user_id').eq('line_user_id', target).maybeSingle();
  if (!exists) {
    return NextResponse.json({ error: 'ยังไม่มีลูกค้าคนนี้ในระบบ — ให้เขาทักบอทก่อนหนึ่งครั้ง' }, { status: 400 });
  }

  const row = await repo.createOrder({
    lineUserId: target, service, note: body.note?.trim() || null, actor: who.userId,
  });
  await repo.audit({
    actor: who.userId, action: 'order.create', entity: `orders:${row.id}`,
    before: null, after: row,
  });
  return NextResponse.json({ ok: true, id: row.id });
}
