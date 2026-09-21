/**
 * ข้อมูลลูกค้าหนึ่งคน — เอกสาร การเตือนแต่ละรอบ และเคสที่เคยเปิด
 *
 * ใช้ตอบคำถามที่เกิดจริง: "ทำไมไม่เห็นเตือนเลย"
 * คำตอบอยู่ครบในหน้าเดียว — บันทึกไว้ไหม กดถูกต้องหรือยัง คิวตั้งวันไหน ส่งออกหรือค้าง
 *
 * ทุกครั้งที่เปิดดูถูกจดลงประวัติ (วันละครั้งต่อคนดูต่อลูกค้า)
 * ลูกค้าถามว่าใครเคยดูข้อมูลของเขา เราต้องตอบได้
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, denied, can } from '@/lib/admin/auth';
import * as repo from '@/lib/db/repo';
import { db } from '@/lib/db/client';
import { docType } from '@/lib/domain/docTypes';
import { OPEN_STATUSES, SERVICE_TH } from '@/lib/domain/caseWork';
import { formatThai, todayInBangkok, daysBetween } from '@/lib/domain/thaiDate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOURCE_TH: Record<string, string> = {
  ocr: 'อ่านจากรูป',
  text: 'อ่านจากข้อความ',
  manual: 'ลูกค้าเลือกวันเอง',
  rollover: 'ต่ออายุรอบใหม่',
};

const QUEUE_TH: Record<string, string> = {
  pending: 'รอส่ง', sent: 'ส่งแล้ว', skipped: 'ไม่ต้องส่งแล้ว', failed: 'ส่งไม่ออก',
};

interface DocRow {
  id: string; doc_type: string; label: string | null; expiry_date: string;
  confirmed_by_user: boolean; source: string; renewed_count: number;
  archived_at: string | null; created_at: string;
}
interface QueueRow {
  id: string; document_id: string; send_on: string; kind: string;
  status: string; sent_at: string | null; error: string | null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return denied(gate.status);
  const who = gate.who;
  const { id } = await ctx.params;
  if (!/^U[0-9a-f]{32}$/.test(id)) {
    return NextResponse.json({ error: 'รหัสลูกค้าไม่ถูกต้อง' }, { status: 400 });
  }

  const supabase = db();
  const today = todayInBangkok();

  const [{ data: user }, { data: orders }] = await Promise.all([
    supabase.from('users')
      .select('line_user_id, display_name, followed_at, unfollowed_at, deleted_at')
      .eq('line_user_id', id).maybeSingle(),
    supabase.from('orders')
      .select('id, service, status, created_at')
      .eq('line_user_id', id).order('created_at', { ascending: false }).limit(50),
  ]);
  const u = user as {
    line_user_id: string; display_name: string | null; followed_at: string;
    unfollowed_at: string | null; deleted_at: string | null;
  } | null;
  if (!u || u.deleted_at) {
    return NextResponse.json({ error: 'ไม่มีลูกค้าคนนี้ หรือเขาสั่งลบข้อมูลไปแล้ว' }, { status: 404 });
  }

  const caseRows = (orders as Array<{ id: string; service: string; status: string; created_at: string }>) ?? [];
  const hasOpenCase = caseRows.some((o) => (OPEN_STATUSES as readonly string[]).includes(o.status));
  // ด่านอยู่ที่เซิร์ฟเวอร์ — ซ่อนลิงก์ในหน้ารายชื่ออย่างเดียวกันใครไม่ได้
  if (!can(who, 'people') && !hasOpenCase) {
    return NextResponse.json({ error: 'พนักงานเปิดดูได้เฉพาะลูกค้าที่มีเคสเปิดอยู่' }, { status: 403 });
  }

  await repo.auditViewOncePerDay(who.userId, id, today);

  const [{ data: docData }, { data: queueData }] = await Promise.all([
    supabase.from('documents')
      .select('id, doc_type, label, expiry_date, confirmed_by_user, source, renewed_count, archived_at, created_at')
      .eq('line_user_id', id).order('expiry_date', { ascending: true }).limit(200),
    supabase.from('reminder_queue')
      .select('id, document_id, send_on, kind, status, sent_at, error')
      .eq('line_user_id', id).order('send_on', { ascending: true }).limit(500),
  ]);
  const docs = (docData as DocRow[]) ?? [];
  const queue = (queueData as QueueRow[]) ?? [];
  const queueBy = new Map<string, QueueRow[]>();
  for (const q of queue) queueBy.set(q.document_id, [...(queueBy.get(q.document_id) ?? []), q]);

  const active = docs.filter((d) => !d.archived_at);

  return NextResponse.json({
    me: { role: who.role },
    today,
    customer: {
      lineUserId: u.line_user_id,
      name: u.display_name,
      followedOn: u.followed_at.slice(0, 10),
      blocked: u.unfollowed_at !== null,
      blockedOn: u.unfollowed_at?.slice(0, 10) ?? null,
      purgeOn: u.unfollowed_at
        ? new Date(new Date(u.unfollowed_at).getTime() + repo.BLOCKED_KEEP_DAYS * 86_400_000)
            .toISOString().slice(0, 10)
        : null,
    },
    overview: {
      docs: active.length,
      confirmed: active.filter((d) => d.confirmed_by_user).length,
      archived: docs.length - active.length,
      pending: queue.filter((q) => q.status === 'pending').length,
      failed: queue.filter((q) => q.status === 'failed').length,
      sent: queue.filter((q) => q.status === 'sent').length,
    },
    documents: active.map((d) => ({
      id: d.id,
      typeLabel: docType(d.doc_type).label,
      label: d.label,
      expiry: d.expiry_date,
      expiryThai: formatThai(d.expiry_date),
      daysLeft: daysBetween(today, d.expiry_date),
      confirmed: d.confirmed_by_user,
      sourceLabel: SOURCE_TH[d.source] ?? d.source,
      renewed: d.renewed_count,
      addedOn: d.created_at.slice(0, 10),
      reminders: (queueBy.get(d.id) ?? []).map((q) => ({
        id: q.id,
        on: q.send_on,
        onThai: formatThai(q.send_on),
        kind: q.kind,
        status: q.status,
        statusLabel: QUEUE_TH[q.status] ?? q.status,
        error: q.error,
      })),
    })),
    cases: caseRows.map((o) => ({
      id: o.id,
      status: o.status,
      serviceLabel: SERVICE_TH[o.service as keyof typeof SERVICE_TH] ?? docType(o.service).label,
      openedOn: o.created_at.slice(0, 10),
    })),
  });
}
