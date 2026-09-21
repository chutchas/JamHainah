/**
 * ปุ่มต่ออายุในข้อความเตือน — ดู ตรวจ แก้ เปิดปิด
 *
 * ลิงก์ราชการเน่าแน่นอนและพังเงียบ ๆ — ไม่มีใครบอกเรา ลูกค้ากดแล้วเจอหน้าขาว
 * แล้วคิดว่าบอทเราพัง หน้านี้จึงมีปุ่ม "ตรวจ" ที่ให้เซิร์ฟเวอร์ลองเปิดให้จริง
 *
 * ใครทำอะไรได้:
 *   ทุกคนในทีม     ดูและกดตรวจได้ (ตรวจไม่เปลี่ยนอะไรที่ลูกค้าเห็น)
 *   หัวหน้าขึ้นไป   แก้และเปิดปิดได้ (แก้ปุ๊บ ลูกค้าทุกคนเห็นทันที)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, denied, can } from '@/lib/admin/auth';
import * as repo from '@/lib/db/repo';
import { docType } from '@/lib/domain/docTypes';
import { mapsSearchUrl } from '@/lib/domain/renewActions';
import { todayInBangkok, daysBetween } from '@/lib/domain/thaiDate';
import { checkLabel, checkUrl, checkSearchTerm } from '@/lib/domain/actionRules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ไม่ได้ตรวจเกิน 90 วัน = น่าสงสัย ตรงกับ view v_links_to_check ใน migration 0007 */
const STALE_DAYS = 90;

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return denied(gate.status);
  const today = todayInBangkok();

  const rows = await repo.listRenewActions();
  return NextResponse.json({
    me: { role: gate.who.role },
    canEdit: can(gate.who, 'content'),
    actions: rows.map((r) => {
      const age = r.verified_at ? daysBetween(r.verified_at, today) : null;
      return {
        id: r.id,
        docType: r.doc_type,
        docLabel: docType(r.doc_type).label,
        kind: r.kind,
        label: r.label,
        url: r.url,
        searchTerm: r.search_term,
        // ลิงก์แผนที่ที่ลูกค้าจะได้จริง — ให้คนในทีมลองกดดูได้โดยไม่ต้องประกอบเอง
        mapsUrl: r.kind === 'location' && r.search_term ? mapsSearchUrl(r.search_term) : null,
        enabled: r.enabled,
        verifiedAt: r.verified_at,
        verifiedAgo: age,
        stale: r.kind === 'link' && r.enabled && (age === null || age > STALE_DAYS),
      };
    }),
  });
}

/**
 * ลองเปิดลิงก์จริงจากเซิร์ฟเวอร์
 *
 * บางเว็บราชการกันบอท ตอบ 403 ทั้งที่คนเปิดได้ปกติ — จึงไม่ถือว่าพังทันที
 * แต่บอกตรง ๆ ว่าตอบอะไรมา ให้คนตัดสินใจเองว่าจะลองเปิดด้วยมือหรือไม่
 */
async function probe(url: string): Promise<{ ok: boolean; say: string }> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'user-agent': 'Mozilla/5.0 (JamHainah link check)' },
    });
    if (res.status < 400) return { ok: true, say: `เปิดได้ (${res.status})` };
    if (res.status === 403 || res.status === 401) {
      return { ok: false, say: `เว็บตอบ ${res.status} — อาจกันบอท ลองกดเปิดเองอีกที` };
    }
    return { ok: false, say: `เปิดไม่ได้ เว็บตอบ ${res.status}` };
  } catch (err) {
    const timeout = err instanceof Error && err.name === 'TimeoutError';
    return { ok: false, say: timeout ? 'เปิดไม่ได้ รอเกิน 8 วินาที' : 'เปิดไม่ได้ ติดต่อเว็บไม่ได้เลย' };
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return denied(gate.status);
  const who = gate.who;

  const body = (await req.json()) as {
    id?: string; op?: 'check' | 'edit' | 'toggle';
    label?: string; url?: string; searchTerm?: string;
  };
  const before = body.id ? await repo.getRenewAction(body.id) : null;
  if (!before) return NextResponse.json({ error: 'ไม่พบปุ่มนี้' }, { status: 404 });

  // ---- ตรวจ: ทุกคนทำได้ ----
  if (body.op === 'check') {
    if (before.kind !== 'link' || !before.url) {
      return NextResponse.json({ error: 'ปุ่มนี้ไม่ใช่ลิงก์เว็บไซต์' }, { status: 400 });
    }
    // เปิดเฉพาะ url ที่เก็บในฐานข้อมูล ไม่รับ url จากคนกด
    // ไม่งั้นปุ่มนี้กลายเป็นช่องให้เซิร์ฟเวอร์เราไปเปิดที่ไหนก็ได้ตามที่ใครส่งมา
    const result = await probe(before.url);
    if (result.ok) {
      const after = await repo.updateRenewAction(before.id, { verified_at: todayInBangkok() });
      await repo.audit({
        actor: who.userId, action: 'link.verify', entity: `renew_actions:${before.id}`, before, after,
      });
    }
    return NextResponse.json({ ok: true, note: `${before.label}: ${result.say}`, alive: result.ok });
  }

  // ---- แก้และเปิดปิด: หัวหน้าขึ้นไป ----
  if (!can(who, 'content')) {
    return NextResponse.json({ error: 'แก้ปุ่มได้เฉพาะหัวหน้าขึ้นไป' }, { status: 403 });
  }

  if (body.op === 'toggle') {
    const after = await repo.updateRenewAction(before.id, { enabled: !before.enabled });
    await repo.audit({
      actor: who.userId, action: after.enabled ? 'link.enable' : 'link.disable',
      entity: `renew_actions:${before.id}`, before, after,
    });
    return NextResponse.json({
      ok: true, note: after.enabled ? `เปิดปุ่ม ${after.label} แล้ว` : `ปิดปุ่ม ${after.label} แล้ว`,
    });
  }

  if (body.op === 'edit') {
    const patch: Parameters<typeof repo.updateRenewAction>[1] = {};

    if (body.label !== undefined) {
      const bad = checkLabel(body.label);
      if (bad) return NextResponse.json({ error: bad }, { status: 400 });
      patch.label = body.label.trim();
    }
    if (body.url !== undefined && before.kind === 'link') {
      const bad = checkUrl(body.url);
      if (bad) return NextResponse.json({ error: bad }, { status: 400 });
      patch.url = body.url.trim();
      // ลิงก์ใหม่ยังไม่มีใครตรวจ — ล้างวันที่ตรวจเดิม ไม่งั้นมันจะดูเหมือนตรวจแล้ว
      if (patch.url !== before.url) patch.verified_at = null;
    }
    if (body.searchTerm !== undefined && before.kind === 'location') {
      const bad = checkSearchTerm(body.searchTerm);
      if (bad) return NextResponse.json({ error: bad }, { status: 400 });
      patch.search_term = body.searchTerm.trim();
    }

    const after = await repo.updateRenewAction(before.id, patch);
    await repo.audit({
      actor: who.userId, action: 'link.edit', entity: `renew_actions:${before.id}`, before, after,
    });
    return NextResponse.json({ ok: true, note: `บันทึกปุ่ม ${after.label} แล้ว` });
  }

  return NextResponse.json({ error: 'ไม่รู้จักคำสั่งนี้' }, { status: 400 });
}
