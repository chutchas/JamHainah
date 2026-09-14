/**
 * รายการเตือนที่ยังไม่ได้ยิง และปุ่มยิงซ้ำ
 *
 * "ยังไม่ได้ยิง" มีสองแบบ และต้องแยกให้เห็น เพราะคนละสาเหตุคนละวิธีแก้:
 *   ค้าง  (pending ที่เลยวันส่งมาแล้ว) — รอบเช้าไม่ได้รัน หรือรันไม่ถึงแถวนี้
 *   ล้มเหลว (failed)                    — ยิงแล้วแต่ LINE ไม่รับ เช่น ผู้ใช้บล็อกบอท
 *
 * ที่นี่ไม่ยิงเอง — เรียก sendToUser ใน engine ตัวเดียวกับรอบเช้า
 * ถ้ายิงเองจะมีสองที่ที่รู้กติกา แล้ววันหนึ่งจะตัดสินไม่เหมือนกัน
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, denied, can } from '@/lib/admin/auth';
import { db } from '@/lib/db/client';
import * as repo from '@/lib/db/repo';
import { todayInBangkok } from '@/lib/domain/thaiDate';
import { docType } from '@/lib/domain/docTypes';
import { loadRenewActions } from '@/lib/domain/renewActions';
import {
  QUEUE_SELECT, groupByUser, isDead, markFailed, sendToUser, type QueueRow,
} from '@/lib/reminders/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86400_000);

/** แถวที่ควรโผล่ในหน้านี้: ค้างเลยวันส่ง หรือยิงแล้วไม่ผ่าน */
async function loadStuck(today: string): Promise<QueueRow[]> {
  const { data, error } = await db()
    .from('reminder_queue')
    .select(QUEUE_SELECT)
    .or(`and(status.eq.pending,send_on.lte.${today}),status.eq.failed`)
    .order('send_on', { ascending: true })
    .limit(500);
  if (error) throw new Error(`อ่านคิวเตือนไม่สำเร็จ: ${error.message}`);
  return (data ?? []) as unknown as QueueRow[];
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return denied(gate.status);
  const who = gate.who;

  const today = todayInBangkok();
  const rows = await loadStuck(today);

  const people = [...groupByUser(rows)].map(([lineUserId, bucket]) => {
    const all = [...bucket.upcoming, ...bucket.due];
    const items = all.map((r) => ({
      id: r.id,
      kind: r.kind,
      status: r.status ?? 'pending',
      error: r.error ?? null,
      sendOn: r.send_on,
      lateDays: Math.max(0, dayDiff(r.send_on, today)),
      typeLabel: r.documents ? (r.documents.label || docType(r.documents.doc_type).label) : 'เอกสารถูกลบแล้ว',
      expiry: r.documents?.expiry_date ?? null,
      // หมดอายุไปแล้ว = เตือนไปก็ช้าแล้ว ยังกดได้แต่ต้องรู้ตัวก่อนกด
      expired: r.documents ? dayDiff(r.documents.expiry_date, today) > 0 : false,
      // แถวที่ engine จะข้ามอยู่ดี — บอกไว้ก่อน ดีกว่าให้กดแล้วไม่มีอะไรเกิดขึ้น
      dead: isDead(r),
    }));
    return {
      lineUserId,
      name: all[0]?.users?.display_name ?? null,
      blocked: all[0]?.users?.unfollowed_at != null,
      upcoming: bucket.upcoming.length,
      due: bucket.due.length,
      /** ยิงซ้ำหนึ่งครั้ง = กี่ข้อความ กี่บาท — ให้เห็นก่อนกด ไม่ใช่เห็นตอนบิลมา */
      messages: (bucket.upcoming.some((r) => !isDead(r)) ? 1 : 0)
              + (bucket.due.some((r) => !isDead(r)) ? 1 : 0),
      items,
    };
  });

  // ระดับของคนที่กำลังดู — Shell เอาไปขึ้นเป็นป้ายมุมขวา
  return NextResponse.json({ today, people, me: { role: who.role } });
}

/**
 * ยิงซ้ำให้คนหนึ่งคน — ไม่ใช่ทีละใบ
 *
 * กฎเดิมของระบบคือหนึ่งคนได้ไม่เกินสองข้อความต่อวัน การยิงทีละใบ
 * จะทำให้คนที่ค้างสามใบได้สามข้อความติดกัน และจ่ายสามเท่าโดยไม่ได้อะไรเพิ่ม
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return denied(gate.status);
  const who = gate.who;
  // ปุ่มนี้เสียเงินจริงทุกครั้งที่กด — พนักงานเห็นรายการได้ แต่กดไม่ได้
  if (!can(who, 'retry')) {
    return NextResponse.json({ error: 'ยิงซ้ำได้เฉพาะหัวหน้าขึ้นไป' }, { status: 403 });
  }

  const body = (await req.json()) as { lineUserId?: string };
  const target = (body.lineUserId ?? '').trim();
  if (!target) return NextResponse.json({ error: 'ไม่ได้ระบุว่าจะยิงซ้ำให้ใคร' }, { status: 400 });

  const supabase = db();
  const today = todayInBangkok();
  const mine = (await loadStuck(today)).filter((r) => r.line_user_id === target);
  if (!mine.length) {
    return NextResponse.json({ error: 'ไม่มีรายการค้างของคนนี้แล้ว' }, { status: 404 });
  }

  // เช็คด้วยกติกาเดียวกับรอบเช้า ก่อนเสียค่าข้อความ
  const dead = mine.filter(isDead);
  const live = mine.filter((r) => !isDead(r));
  if (dead.length) {
    await supabase.from('reminder_queue').update({ status: 'skipped' }).in('id', dead.map((r) => r.id));
  }
  if (!live.length) {
    await repo.audit({
      actor: who.userId, action: 'reminder.retry.skipped',
      entity: `users:${target}`, before: null, after: { skipped: dead.length },
    });
    return NextResponse.json({
      ok: true, messages: 0,
      note: 'รายการทั้งหมดของคนนี้ไม่ควรส่งแล้ว (เอกสารถูกเก็บ ยังไม่ยืนยัน หรือผู้ใช้บล็อกบอท) — ปิดรายการให้แล้ว',
    });
  }

  const bucket = groupByUser(live).get(target)!;
  try {
    const messages = await sendToUser(supabase, target, bucket, today, await loadRenewActions());
    await repo.audit({
      actor: who.userId, action: 'reminder.retry',
      entity: `users:${target}`, before: null,
      after: { messages, items: live.length, skipped: dead.length },
    });
    return NextResponse.json({ ok: true, messages, skipped: dead.length });
  } catch (err) {
    await markFailed(supabase, live.map((r) => r.id), err);
    await repo.audit({
      actor: who.userId, action: 'reminder.retry.failed',
      entity: `users:${target}`, before: null, after: { error: String(err).slice(0, 300) },
    });
    return NextResponse.json({ error: `ยิงไม่ออก: ${String(err).slice(0, 200)}` }, { status: 502 });
  }
}
