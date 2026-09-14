/**
 * เปลี่ยนสถานะงาน — ทางเดียวที่สถานะเปลี่ยนได้จากหน้าเว็บ
 *
 * ทุกครั้งลง audit_log และ order_events:
 *   audit_log ตอบว่าใครแตะ — ไว้ใช้ตอนมีเรื่อง
 *   order_events ตอบว่างานเดินมาถึงไหน — ไว้ใช้ตอนทำงาน
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, denied } from '@/lib/admin/auth';
import * as repo from '@/lib/db/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return denied(gate.status);
  const who = gate.who;

  const body = (await req.json()) as { id?: string; status?: string; note?: string };
  const id = (body.id ?? '').trim();
  const status = body.status as repo.OrderStatus;

  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });
  if (!repo.ORDER_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'สถานะไม่ถูกต้อง' }, { status: 400 });
  }

  const before = await repo.getOrder(id);
  if (!before) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const after = await repo.setOrderStatus({
    id, status, actor: who.userId, note: body.note,
  });
  await repo.audit({
    actor: who.userId, action: 'order.status', entity: `orders:${id}`, before, after,
  });
  return NextResponse.json({ ok: true, order: after });
}
