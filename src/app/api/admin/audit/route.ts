/**
 * ประวัติการแก้ไข — เจ้าของระบบเท่านั้น
 *
 * ก้อน before/after มีทั้งราคาและรายละเอียดของลูกค้า จึงไม่ใช่ของที่ทุกคนในทีมควรเห็น
 * และคนที่ต้องการดูประวัติว่าใครแตะอะไร คือคนที่รับผิดชอบเรื่องนั้นอยู่แล้ว
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, denied, can } from '@/lib/admin/auth';
import * as repo from '@/lib/db/repo';
import { db } from '@/lib/db/client';
import { formatThai } from '@/lib/domain/thaiDate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ชื่อ action ในฐานข้อมูล -> ประโยคที่คนอ่านออกโดยไม่ต้องรู้ชื่อตาราง */
const SAY: Record<string, string> = {
  'order.create': 'เปิดเคส',
  'order.status': 'เปลี่ยนสถานะเคส',
  'order.edit': 'แก้รายละเอียดเคส',
  'order.note': 'จดบันทึกในเคส',
  'admin.add': 'เพิ่มคนเข้าทีม',
  'admin.update': 'แก้ข้อมูลคนในทีม',
  'admin.role': 'เปลี่ยนระดับสิทธิ์',
  'admin.disable': 'ถอดสิทธิ์',
  'reminder.retry': 'ยิงเตือนซ้ำ',
  'reminder.retry.failed': 'ยิงเตือนซ้ำแล้วไม่ออก',
  'reminder.retry.skipped': 'ปิดรายการเตือนที่ไม่ต้องส่งแล้ว',
  'link.verify': 'ตรวจลิงก์ผ่าน',
  'link.verify.manual': 'ยืนยันเองว่าลิงก์เปิดได้',
  'link.edit': 'แก้ปุ่มต่ออายุ',
  'link.enable': 'เปิดปุ่มต่ออายุ',
  'link.disable': 'ปิดปุ่มต่ออายุ',
  'customer.view': 'เปิดดูข้อมูลลูกค้า',
  'customer.names': 'ดึงชื่อลูกค้าจาก LINE',
};

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return denied(gate.status);
  if (!can(gate.who, 'team')) {
    return NextResponse.json({ error: 'ดูประวัติได้เฉพาะเจ้าของระบบ' }, { status: 403 });
  }

  const [rows, admins] = await Promise.all([repo.listAudit(60), repo.listAdmins()]);
  const nameBy = new Map(admins.map((a) => [a.line_user_id, a.display_name]));

  // ชื่อลูกค้าที่ถูกเปิดดู — ไม่งั้นประวัติจะเป็นรหัส U ยาว ๆ ที่ไม่มีใครอ่านออก
  const customerIds = [...new Set(rows
    .filter((r) => r.entity?.startsWith('users:'))
    .map((r) => r.entity!.slice(6)))];
  const { data: people } = customerIds.length
    ? await db().from('users').select('line_user_id, display_name').in('line_user_id', customerIds)
    : { data: [] };
  const customerBy = new Map(
    ((people as Array<{ line_user_id: string; display_name: string | null }>) ?? [])
      .map((p) => [p.line_user_id, p.display_name]),
  );

  return NextResponse.json({
    me: { role: gate.who.role },
    entries: rows.map((r) => ({
      id: r.id,
      at: r.at,
      on: r.at.slice(0, 10),
      atThai: formatThai(r.at.slice(0, 10)),
      // เวลาแบบชั่วโมงนาที — ประวัติมักถูกอ่านเพื่อเรียงลำดับเหตุการณ์ในวันเดียวกัน
      time: new Date(r.at).toLocaleTimeString('th-TH', {
        timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit',
      }),
      byName: nameBy.get(r.actor) ?? `${r.actor.slice(0, 5)}…${r.actor.slice(-4)}`,
      what: SAY[r.action] ?? r.action,
      /** ของที่ถูกแตะ — ตัด uuid ให้สั้นพอจำได้ว่าเป็นตัวเดียวกัน */
      target: r.entity
        ? r.entity.startsWith('orders:')
          ? `เคส ${r.entity.slice(7, 15)}`
          : r.entity.startsWith('admins:')
            ? (nameBy.get(r.entity.slice(7)) ?? 'คนในทีม')
            : r.entity.startsWith('users:')
              ? (customerBy.get(r.entity.slice(6)) ?? 'ลูกค้า')
            : r.entity.startsWith('renew_actions:')
              ? String((r.after as { label?: string } | null)?.label ?? 'ปุ่มต่ออายุ')
              : r.entity
        : null,
      orderId: r.entity?.startsWith('orders:') ? r.entity.slice(7) : null,
      customerId: r.entity?.startsWith('users:') ? r.entity.slice(6) : null,
    })),
  });
}
