/**
 * กติกาการส่งเตือน — ที่เดียวที่รู้ว่า "แถวไหนควรส่ง และส่งยังไง"
 *
 * แยกออกมาจาก run.ts ตอนทำปุ่มยิงซ้ำในหน้าห้องทำงาน
 * เพราะถ้าปล่อยให้ปุ่มนั้นเขียนตรรกะเอง จะมีสองที่ที่รู้กติกา
 * แล้ววันหนึ่งรอบเช้ากับปุ่มยิงซ้ำจะตัดสินไม่เหมือนกัน — โดยไม่มีใครรู้ตัว
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { push } from '@/lib/line/client';
import { upcomingReminder, dueReminder, type ReminderItem } from '@/lib/line/messages';
import { track } from '@/lib/db/repo';
import type { loadRenewActions } from '@/lib/domain/renewActions';

export interface QueueRow {
  id: string;
  document_id: string;
  line_user_id: string;
  send_on: string;
  offset_days: number;
  kind: 'upcoming' | 'due';
  status?: string;
  error?: string | null;
  documents: {
    id: string; doc_type: string; label: string | null;
    expiry_date: string; archived_at: string | null; confirmed_by_user: boolean;
  } | null;
  users: { display_name: string | null; unfollowed_at: string | null; deleted_at: string | null } | null;
}

/** เลือกฟิลด์ชุดเดียวกันทุกที่ — คนละชุดเมื่อไหร่ isDead จะตัดสินจากของที่ไม่มี */
export const QUEUE_SELECT =
  'id, document_id, line_user_id, send_on, offset_days, kind, status, error,' +
  'documents ( id, doc_type, label, expiry_date, archived_at, confirmed_by_user ),' +
  'users ( display_name, unfollowed_at, deleted_at )';

/**
 * แถวที่ไม่ควรส่ง — เช็คก่อนเสียค่าข้อความเสมอ
 *
 * "ยังไม่กดยืนยัน" ก็นับว่าไม่ควรส่ง เพราะเรายังไม่รับประกันว่าวันที่ถูก
 * การเตือนด้วยวันที่ผิด แย่กว่าการไม่เตือน
 */
export function isDead(r: QueueRow): boolean {
  const doc = r.documents;
  const usr = r.users;
  return (
    !doc || doc.archived_at !== null ||
    !doc.confirmed_by_user ||
    !usr || usr.unfollowed_at !== null || usr.deleted_at !== null
  );
}

export function toItem(r: QueueRow): ReminderItem {
  return {
    documentId: r.document_id,
    typeKey: r.documents!.doc_type,
    label: r.documents!.label,
    expiry: r.documents!.expiry_date,
    offsetDays: r.offset_days,
  };
}

export interface Bucket { upcoming: QueueRow[]; due: QueueRow[] }

export function groupByUser(rows: QueueRow[]): Map<string, Bucket> {
  const byUser = new Map<string, Bucket>();
  for (const r of rows) {
    let bucket = byUser.get(r.line_user_id);
    if (!bucket) { bucket = { upcoming: [], due: [] }; byUser.set(r.line_user_id, bucket); }
    bucket[r.kind].push(r);
  }
  return byUser;
}

/**
 * ส่งให้คนหนึ่งคน แล้วปิดแถวที่ส่งสำเร็จ
 *
 * กฎข้อ 4 อยู่ตรงนี้: หนึ่งคนได้ไม่เกินสองข้อความ (ใกล้ครบกำหนด + ครบกำหนดแล้ว)
 * ไม่ว่าจะมีเอกสารค้างกี่ใบ — และเป็นเหตุผลว่าทำไมปุ่มยิงซ้ำถึงยิงเป็น "คน" ไม่ใช่ "ใบ"
 *
 * โยน error ออกไปให้ผู้เรียกจัดการ เพราะรอบเช้ากับปุ่มยิงซ้ำ
 * ต้องการทำคนละอย่างตอนพัง (รอบเช้านับใส่รายงาน · ปุ่มตอบกลับคนกด)
 */
export async function sendToUser(
  supabase: SupabaseClient,
  userId: string,
  bucket: Bucket,
  today: string,
  actionsByType: Awaited<ReturnType<typeof loadRenewActions>>,
): Promise<number> {
  const ok: string[] = [];
  let messages = 0;

  if (bucket.upcoming.length) {
    await push(userId, upcomingReminder(bucket.upcoming.map(toItem), today, actionsByType));
    messages++;
    ok.push(...bucket.upcoming.map((r) => r.id));
  }
  if (bucket.due.length) {
    await push(userId, dueReminder(bucket.due.map(toItem)));
    messages++;
    ok.push(...bucket.due.map((r) => r.id));
  }

  await supabase
    .from('reminder_queue')
    .update({ status: 'sent', sent_at: new Date().toISOString(), error: null })
    .in('id', ok);

  await track('reminder_sent', userId, {
    upcoming: bucket.upcoming.length,
    due: bucket.due.length,
    messages,
  });
  return messages;
}

export async function markFailed(
  supabase: SupabaseClient, ids: string[], err: unknown,
): Promise<void> {
  await supabase
    .from('reminder_queue')
    .update({ status: 'failed', error: String(err).slice(0, 500) })
    .in('id', ids);
}
