/**
 * ตัวเลขทั้งหมดของห้องทำงาน — อ่านอย่างเดียว
 *
 * หน้านี้เห็นข้อมูลของลูกค้าทุกคน จึงต้องผ่านสองด่าน:
 *   1. ต้องรู้ว่าเป็นใคร — คุกกี้ที่เราเซ็นเอง หรือ idToken จาก LINE
 *   2. user id ที่ได้ ต้องอยู่ใน ADMIN_LINE_USER_ID หรือตาราง admins
 * ไม่มีรหัสผ่านแยก เพราะรหัสที่ต้องจำเพิ่ม คือรหัสที่วันหนึ่งจะหลุด
 *
 * ถ้ายังไม่ได้ตั้ง ADMIN_LINE_USER_ID จะเข้าไม่ได้เลยแม้แต่คนเดียว —
 * ปลอดภัยกว่าการเปิดให้ทุกคนตอนที่ยังไม่ได้ตั้งค่า
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, denied, can } from '@/lib/admin/auth';
import * as repo from '@/lib/db/repo';
import { db } from '@/lib/db/client';
import { todayInBangkok, formatThai } from '@/lib/domain/thaiDate';
import { docType } from '@/lib/domain/docTypes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface EventRow {
  name: string;
  line_user_id: string | null;
  props: Record<string, unknown>;
  created_at: string;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return denied(gate.status);
  const who = gate.who;

  const supabase = db();
  const today = todayInBangkok();

  const count = async (
    table: string,
    apply: (q: any) => any = (q) => q
  ): Promise<number> => {
    const { count: n } = await apply(supabase.from(table).select('id', { count: 'exact', head: true }));
    return n ?? 0;
  };

  const [
    users, unfollowed, docs, confirmed,
    pendingToday, failedQueue, sentWeek,
  ] = await Promise.all([
    count('users', (q) => q.is('deleted_at', null)),
    count('users', (q) => q.not('unfollowed_at', 'is', null)),
    count('documents', (q) => q.is('archived_at', null)),
    count('documents', (q) => q.is('archived_at', null).eq('confirmed_by_user', true)),
    count('reminder_queue', (q) => q.eq('status', 'pending').lte('send_on', today)),
    count('reminder_queue', (q) => q.eq('status', 'failed')),
    count('reminder_queue', (q) => q.eq('status', 'sent').gte('sent_at', daysAgo(7))),
  ]);

  // events 30 วันล่าสุด — ใช้ตอบทั้งเรื่องความแม่นและเรื่องงานเข้า
  const { data: evData } = await supabase
    .from('events')
    .select('name, line_user_id, props, created_at')
    .gte('created_at', daysAgo(30))
    .order('created_at', { ascending: false })
    .limit(4000);
  const events = (evData ?? []) as EventRow[];

  const tally: Record<string, number> = {};
  for (const e of events) tally[e.name] = (tally[e.name] ?? 0) + 1;

  /**
   * ความแม่นของการอ่าน — ตัวหารคือ "ครั้งที่อ่านออก" ไม่ใช่ "รูปทั้งหมด"
   * เพราะรูปที่ไม่ใช่เอกสารไม่ได้แปลว่าโมเดลอ่านผิด
   */
  const readOk = tally['extract_hit'] ?? 0;
  const corrected = (tally['date_corrected'] ?? 0) + (tally['ocr_corrected'] ?? 0);
  const accuracy = readOk > 0 ? Math.round((100 * (readOk - corrected)) / readOk) : null;

  // ชื่อผู้ใช้ของ lead — join เองเพราะ events ไม่ได้ผูก FK ไว้
  const leadEvents = events
    .filter((e) => e.name === 'upsell_clicked' || e.name === 'upsell_started')
    .slice(0, 40);
  const leadIds = [...new Set(leadEvents.map((e) => e.line_user_id).filter(Boolean))] as string[];
  const { data: nameRows } = leadIds.length
    ? await supabase.from('users').select('line_user_id, display_name').in('line_user_id', leadIds)
    : { data: [] as Array<{ line_user_id: string; display_name: string | null }> };
  const names = new Map((nameRows ?? []).map((r) => [r.line_user_id, r.display_name]));

  const leads = leadEvents.map((e) => {
    const key = String((e.props as { typeKey?: string }).typeKey ?? 'custom');
    return {
      at: e.created_at,
      atThai: formatThai(e.created_at.slice(0, 10)),
      name: names.get(e.line_user_id ?? '') ?? null,
      lineUserId: e.line_user_id,
      typeLabel: docType(key).label,
      via: String((e.props as { via?: string }).via ?? 'chat'),
      started: e.name === 'upsell_started',
    };
  });

  // รอบ cron ล่าสุด — ตอบคำถามว่า "เมื่อเช้ามันทำงานไหม"
  const lastCron = events.find((e) => e.name === 'cron_run');
  /**
   * ตัวเลขเงินถูกตัดออกที่เซิร์ฟเวอร์ ไม่ใช่ซ่อนที่หน้าจอ
   * ของที่ส่งไปถึงเบราว์เซอร์แล้ว ถือว่าคนที่นั่งอยู่หน้าจอนั้นเห็นแล้ว
   * ต่อให้ CSS จะซ่อนไว้ก็ตาม
   */
  const seesMoney = can(who, 'money');

  // คิวงานจริง — ของที่ต้องลงมือทำ ไม่ใช่ตัวเลขไว้ดู
  const [orderRows, adminRows] = await Promise.all([repo.listOrders(30), repo.listAdmins()]);
  const orderUserIds = [...new Set(orderRows.map((o) => o.line_user_id))];
  const { data: orderNames } = orderUserIds.length
    ? await supabase.from('users').select('line_user_id, display_name').in('line_user_id', orderUserIds)
    : { data: [] as Array<{ line_user_id: string; display_name: string | null }> };
  const orderNameBy = new Map((orderNames ?? []).map((r) => [r.line_user_id, r.display_name]));

  const orders = orderRows.map((o) => ({
    id: o.id,
    status: o.status,
    service: docType(o.service).label,
    name: orderNameBy.get(o.line_user_id) ?? null,
    lineUserId: o.line_user_id,
    atThai: formatThai(o.created_at.slice(0, 10)),
    assignee: o.assignee,
    note: o.note,
    priceThb: seesMoney ? o.price_thb : null,
    paid: o.paid_at !== null,
  }));

  return NextResponse.json({
    today,
    overview: {
      users, unfollowed, docs, confirmed,
      docsPerUser: users > 0 ? Number((docs / users).toFixed(2)) : 0,
      confirmedPct: docs > 0 ? Math.round((100 * confirmed) / docs) : 0,
    },
    reminders: {
      pendingToday, failedQueue, sentWeek,
      lastCron: lastCron
        ? (() => {
            const { estimated_cost_thb, ...rest } = lastCron.props as Record<string, unknown>;
            return { at: lastCron.created_at, ...rest, ...(seesMoney ? { estimated_cost_thb } : {}) };
          })()
        : null,
    },
    reading: {
      readOk,
      corrected,
      accuracy,
      missed: tally['extract_miss'] ?? 0,
      notDocument: tally['image_not_document'] ?? 0,
      ocrError: tally['ocr_error'] ?? 0,
      limitHit: tally['ai_limit_hit'] ?? 0,
      aiCalls: tally['ai_call'] ?? 0,
    },
    leads,
    orders,
    team: adminRows.map((a) => ({
      lineUserId: a.line_user_id,
      name: a.display_name,
      role: a.role,
      disabled: a.disabled_at !== null,
    })),
    me: { userId: who.userId, role: who.role, bootstrap: who.bootstrap, seesMoney },
    tally,
  });
}
