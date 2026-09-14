/**
 * เคสหนึ่งชิ้น — รายละเอียด และการแก้ไข
 *
 * หน้านี้คือที่เก็บของที่เคยอยู่ในหัวคนเดียว: คุยอะไรไว้ ราคาเท่าไหร่
 * เก็บเงินหรือยัง ทะเบียนอะไร ใครรับผิดชอบ
 * ทุกการเปลี่ยนแปลงลงสองที่ — audit_log (ใครแตะ) และ order_events (งานเดินถึงไหน)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, denied, can } from '@/lib/admin/auth';
import * as repo from '@/lib/db/repo';
import { db } from '@/lib/db/client';
import { formatThai } from '@/lib/domain/thaiDate';
import { docType } from '@/lib/domain/docTypes';
import { SERVICE_TH, VEHICLE_FIELDS } from '@/lib/domain/caseWork';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return denied(gate.status);
  const who = gate.who;
  const seesMoney = can(who, 'money');

  const { id } = await ctx.params;
  const order = await repo.getOrder(id);
  if (!order) return NextResponse.json({ error: 'ไม่พบเคสนี้' }, { status: 404 });

  const [{ data: user }, events, admins] = await Promise.all([
    db().from('users').select('display_name').eq('line_user_id', order.line_user_id).maybeSingle(),
    repo.listOrderEvents(id),
    repo.listAdmins(),
  ]);
  const staffName = new Map(admins.map((a) => [a.line_user_id, a.display_name]));

  let document: { label: string; expiryThai: string } | null = null;
  if (order.document_id) {
    const { data: d } = await db()
      .from('documents').select('doc_type, label, expiry_date').eq('id', order.document_id).maybeSingle();
    if (d) {
      const row = d as { doc_type: string; label: string | null; expiry_date: string };
      document = { label: row.label || docType(row.doc_type).label, expiryThai: formatThai(row.expiry_date) };
    }
  }

  return NextResponse.json({
    id: order.id,
    status: order.status,
    service: order.service,
    serviceLabel: SERVICE_TH[order.service] ?? order.service,
    name: (user as { display_name: string | null } | null)?.display_name ?? null,
    lineUserId: order.line_user_id,
    atThai: formatThai(order.created_at.slice(0, 10)),
    note: order.note,
    vehicle: order.vehicle ?? {},
    purgeAfterThai: order.purge_after ? formatThai(order.purge_after) : null,
    purged: order.purged_at !== null,
    document,
    seesMoney,
    canEdit: can(who, 'queue'),
    priceThb: seesMoney ? order.price_thb : null,
    paid: order.paid_at !== null,
    events: events.map((e) => ({
      kind: e.kind,
      at: e.at,
      atThai: formatThai(e.at.slice(0, 10)),
      byName: e.actor ? (staffName.get(e.actor) ?? e.actor.slice(0, 8)) : 'ระบบ',
      detail: e.detail,
    })),
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return denied(gate.status);
  const who = gate.who;

  const { id } = await ctx.params;
  const before = await repo.getOrder(id);
  if (!before) return NextResponse.json({ error: 'ไม่พบเคสนี้' }, { status: 404 });

  const body = (await req.json()) as {
    status?: string; priceThb?: number | null; paid?: boolean;
    vehicle?: Record<string, string>; note?: string; addNote?: string;
  };

  // จดโน้ต — ทำได้ทุกระดับ ของที่คุยกับลูกค้าต้องจดได้ทันทีโดยไม่ต้องขออนุญาตใคร
  if (body.addNote !== undefined) {
    const text = body.addNote.trim();
    if (!text) return NextResponse.json({ error: 'ยังไม่ได้พิมพ์อะไร' }, { status: 400 });
    await repo.addOrderNote({ id, actor: who.userId, text: text.slice(0, 2000) });
    await repo.audit({
      actor: who.userId, action: 'order.note', entity: `orders:${id}`, before: null, after: { text },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.status !== undefined) {
    if (!repo.ORDER_STATUSES.includes(body.status as repo.OrderStatus)) {
      return NextResponse.json({ error: 'สถานะไม่ถูกต้อง' }, { status: 400 });
    }
    const after = await repo.setOrderStatus({
      id, status: body.status as repo.OrderStatus, actor: who.userId,
    });
    await repo.audit({
      actor: who.userId, action: 'order.status', entity: `orders:${id}`, before, after,
    });
    return NextResponse.json({ ok: true });
  }

  // ราคากับการรับเงิน แตะได้เฉพาะคนที่เห็นเงินอยู่แล้ว
  if ((body.priceThb !== undefined || body.paid !== undefined) && !can(who, 'money')) {
    return NextResponse.json({ error: 'เรื่องเงินแก้ได้เฉพาะหัวหน้าขึ้นไป' }, { status: 403 });
  }

  /**
   * รับเฉพาะช่องที่เรารู้จัก — ก้อนนี้มาจากฟอร์ม และจะถูกส่งต่อให้โบรกเกอร์
   * ปล่อยให้ใส่อะไรก็ได้ แปลว่าเก็บอะไรก็ได้ ซึ่งขัดกับที่ตกลงว่าจะเก็บเท่าที่ต้องใช้
   */
  let vehicle: Record<string, unknown> | undefined;
  if (body.vehicle) {
    vehicle = {};
    for (const f of VEHICLE_FIELDS) {
      const v = body.vehicle[f.key]?.trim();
      if (v) vehicle[f.key] = v.slice(0, 120);
    }
  }

  const after = await repo.updateOrder({
    id, actor: who.userId,
    priceThb: body.priceThb,
    paid: body.paid,
    vehicle,
    note: body.note?.slice(0, 2000),
  });
  await repo.audit({
    actor: who.userId, action: 'order.edit', entity: `orders:${id}`, before, after,
  });
  return NextResponse.json({ ok: true });
}
