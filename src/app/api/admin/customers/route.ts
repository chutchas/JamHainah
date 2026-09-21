/**
 * รายชื่อลูกค้า — ใครแอดมา บันทึกอะไรไว้ และใบไหนใกล้หมด
 *
 * เอกสารดูอย่างเดียว — ข้อมูลเอกสารเป็นของลูกค้า
 * ถ้าผิด ให้เขาแก้เองในหน้า "เอกสารของฉัน" ไม่ใช่ให้ทีมแก้แทนโดยเขาไม่รู้
 *
 * POST มีงานเดียว: ขอชื่อจาก LINE ให้คนที่ยังไม่มีชื่อ
 * ชื่อเป็นของที่ LINE ให้มาอยู่แล้ว ไม่ใช่ของที่ทีมพิมพ์เอง จึงแตะได้แค่ display_name
 *
 * พนักงานเห็นเฉพาะลูกค้าที่มีเคสเปิดอยู่ (สิทธิ์ people ในตาราง CAN)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, denied, can } from '@/lib/admin/auth';
import { db } from '@/lib/db/client';
import * as repo from '@/lib/db/repo';
import { getProfile } from '@/lib/line/client';
import { OPEN_STATUSES } from '@/lib/domain/caseWork';
import { todayInBangkok, daysBetween } from '@/lib/domain/thaiDate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface UserRow {
  line_user_id: string; display_name: string | null;
  followed_at: string; unfollowed_at: string | null;
}
interface DocRow { line_user_id: string; expiry_date: string; confirmed_by_user: boolean }

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return denied(gate.status);
  const who = gate.who;
  const seesAll = can(who, 'people');
  const supabase = db();
  const today = todayInBangkok();

  const { data: open } = await supabase
    .from('orders').select('line_user_id').in('status', [...OPEN_STATUSES]).limit(1000);
  const withOpenCase = new Set(((open as Array<{ line_user_id: string }>) ?? []).map((o) => o.line_user_id));

  let users: UserRow[] = [];
  if (seesAll) {
    const { data } = await supabase
      .from('users')
      .select('line_user_id, display_name, followed_at, unfollowed_at')
      .is('deleted_at', null)
      .order('followed_at', { ascending: false })
      .limit(1000);
    users = (data as UserRow[]) ?? [];
  } else if (withOpenCase.size) {
    const { data } = await supabase
      .from('users')
      .select('line_user_id, display_name, followed_at, unfollowed_at')
      .in('line_user_id', [...withOpenCase])
      .is('deleted_at', null);
    users = (data as UserRow[]) ?? [];
  }

  const ids = users.map((u) => u.line_user_id);
  const docs: DocRow[] = [];
  // ทีละก้อน — ส่งรหัสพันตัวใน URL เดียว PostgREST จะตอบว่า URL ยาวเกิน
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await supabase
      .from('documents')
      .select('line_user_id, expiry_date, confirmed_by_user')
      .in('line_user_id', ids.slice(i, i + 150))
      .is('archived_at', null);
    docs.push(...((data as DocRow[]) ?? []));
  }

  const byUser = new Map<string, DocRow[]>();
  for (const d of docs) byUser.set(d.line_user_id, [...(byUser.get(d.line_user_id) ?? []), d]);

  return NextResponse.json({
    me: { role: who.role },
    seesAll,
    today,
    customers: users.map((u) => {
      const mine = byUser.get(u.line_user_id) ?? [];
      // ใบที่ยังไม่หมดและใกล้ที่สุด — ใบที่หมดไปแล้วไม่ใช่เรื่องที่ต้องรีบคุย
      const upcoming = mine
        .filter((d) => d.confirmed_by_user && d.expiry_date >= today)
        .map((d) => d.expiry_date)
        .sort()[0] ?? null;
      return {
        lineUserId: u.line_user_id,
        name: u.display_name,
        followedOn: u.followed_at.slice(0, 10),
        blocked: u.unfollowed_at !== null,
        docs: mine.length,
        unconfirmed: mine.filter((d) => !d.confirmed_by_user).length,
        nextExpiry: upcoming,
        daysToNext: upcoming ? daysBetween(today, upcoming) : null,
        openCase: withOpenCase.has(u.line_user_id),
      };
    }),
  });
}

/** ครั้งละไม่เกินเท่านี้ — Vercel ตัดที่ 10 วินาทีบนแพ็กเกจฟรี และ LINE ตอบคนละราว 0.1 วินาที */
const FILL_MAX = 40;

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return denied(gate.status);
  const who = gate.who;
  if (!can(who, 'people')) {
    return NextResponse.json({ error: 'ดึงชื่อได้เฉพาะเจ้าของระบบและหัวหน้า' }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { op?: string };
  if (body.op !== 'fillNames') {
    return NextResponse.json({ error: 'ไม่รู้จักคำสั่งนี้' }, { status: 400 });
  }

  // คนที่บล็อกแล้ว LINE ไม่ให้ชื่ออยู่แล้ว ไม่ต้องเสียเวลาถาม
  const { data } = await db()
    .from('users')
    .select('line_user_id')
    .is('display_name', null)
    .is('deleted_at', null)
    .is('unfollowed_at', null)
    .limit(FILL_MAX);
  const ids = ((data as Array<{ line_user_id: string }>) ?? []).map((r) => r.line_user_id);

  let filled = 0;
  for (const id of ids) {
    const profile = await getProfile(id);
    if (profile?.displayName) {
      await repo.setDisplayName(id, profile.displayName);
      filled++;
    }
  }

  await repo.audit({
    actor: who.userId, action: 'customer.names', entity: null,
    before: null, after: { tried: ids.length, filled },
  });

  const more = ids.length === FILL_MAX ? ' — ยังมีอีก กดอีกครั้งได้' : '';
  return NextResponse.json({
    ok: true,
    note: ids.length === 0
      ? 'ทุกคนที่ยังเป็นเพื่อนอยู่มีชื่อแล้ว'
      : filled === ids.length
        ? `ได้ชื่อครบ ${filled} คน${more}`
        : `ได้ชื่อ ${filled} จาก ${ids.length} คน — ที่เหลือ LINE ไม่ให้ชื่อ (ดูเหตุผลใน log ของ Vercel)${more}`,
  });
}
