/**
 * เพิ่ม/ถอดผู้ดูแล — งานเดียวในหลังบ้านที่แตะสิทธิ์ของคนอื่น
 *
 * เฉพาะ owner เท่านั้น และทุกการเปลี่ยนแปลงลง audit_log เสมอ
 * สิทธิ์ที่เปลี่ยนได้โดยไม่มีใครรู้ว่าใครเปลี่ยน คือสิทธิ์ที่เถียงกันไม่จบ
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isOwner, denied } from '@/lib/admin/auth';
import * as repo from '@/lib/db/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** U ตามด้วย hex 32 ตัว — รูปแบบ LINE user id ของ OA หนึ่งบัญชี */
const LINE_ID = /^U[0-9a-f]{32}$/;

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return denied(gate.status);
  const who = gate.who;
  if (!isOwner(who)) {
    return NextResponse.json({ error: 'เฉพาะเจ้าของระบบเท่านั้นที่เพิ่มหรือถอดผู้ดูแลได้' }, { status: 403 });
  }

  const body = (await req.json()) as {
    lineUserId?: string; role?: 'owner' | 'staff'; displayName?: string; note?: string;
    disable?: boolean;
  };

  const target = (body.lineUserId ?? '').trim();
  if (!LINE_ID.test(target)) {
    return NextResponse.json({ error: 'รหัสไม่ใช่รูปแบบ LINE user id' }, { status: 400 });
  }

  const before = await repo.findAdmin(target);

  if (body.disable) {
    /**
     * ถอดสิทธิ์ตัวเองไม่ได้ — คนที่เผลอกดถอดตัวเองตอนดึก จะเข้าไปแก้กลับไม่ได้
     * จนกว่าจะไปนั่งแก้ที่ Supabase ซึ่งเป็นตอนที่มือสั่นที่สุด
     */
    if (target === who.userId) {
      return NextResponse.json({ error: 'ถอดสิทธิ์ตัวเองไม่ได้' }, { status: 400 });
    }
    await repo.disableAdmin(target);
    await repo.audit({
      actor: who.userId, action: 'admin.disable', entity: `admins:${target}`,
      before, after: null,
    });
    return NextResponse.json({ ok: true });
  }

  const row = await repo.upsertAdmin({
    lineUserId: target,
    role: body.role === 'owner' ? 'owner' : 'staff',
    displayName: body.displayName?.trim() || null,
    note: body.note?.trim() || null,
    addedBy: who.userId,
  });
  await repo.audit({
    actor: who.userId, action: before ? 'admin.update' : 'admin.add',
    entity: `admins:${target}`, before, after: row,
  });
  return NextResponse.json({ ok: true, admin: row });
}
