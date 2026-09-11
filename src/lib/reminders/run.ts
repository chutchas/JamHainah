/**
 * ============================================================
 * เครื่องยนต์การเตือน — ที่เดียวในระบบที่เรียก push()
 * ============================================================
 *
 * รันวันละครั้ง 08:00 น. เวลาไทย (vercel.json ตั้งไว้ 01:00 UTC)
 *
 * กฎข้อ 4 บังคับที่นี่:
 *   อ่านคิวทั้งหมดของวันนี้ -> group ตาม line_user_id -> ค่อยส่ง
 *   ห้าม loop เอกสารแล้ว push ทีละใบ เพราะต้นทุนจะคูณตามจำนวนเอกสาร
 *
 *   ผู้ใช้ 1 คนได้ไม่เกิน 2 ข้อความต่อวัน:
 *     1 ข้อความสำหรับ "ใกล้ครบกำหนด" (ฉาก 06/07)
 *     1 ข้อความสำหรับ "ครบกำหนดแล้ว" (ฉาก 08) ซึ่งต้องการคำตอบรายใบ
 */
import { db } from '@/lib/db/client';
import { push } from '@/lib/line/client';
import { upcomingReminder, dueReminder, type ReminderItem } from '@/lib/line/messages';
import { todayInBangkok } from '@/lib/domain/thaiDate';
import { track, getUserArea } from '@/lib/db/repo';
import { loadRenewActions } from '@/lib/domain/renewActions';

interface QueueRow {
  id: string;
  document_id: string;
  line_user_id: string;
  send_on: string;
  offset_days: number;
  kind: 'upcoming' | 'due';
  documents: {
    id: string; doc_type: string; label: string | null;
    expiry_date: string; archived_at: string | null; confirmed_by_user: boolean;
  } | null;
  users: { unfollowed_at: string | null; deleted_at: string | null } | null;
}

export async function runReminders() {
  const supabase = db();
  const today = todayInBangkok();
  // อ่านครั้งเดียวต่อรอบ ไม่ใช่ทุกผู้ใช้
  const actionsByType = await loadRenewActions();

  // คิวของวันนี้และที่ค้างมาจากวันก่อน (เผื่อ cron ล่ม)
  const { data, error } = await supabase
    .from('reminder_queue')
    .select(
      'id, document_id, line_user_id, send_on, offset_days, kind,' +
      'documents ( id, doc_type, label, expiry_date, archived_at, confirmed_by_user ),' +
      'users ( unfollowed_at, deleted_at )'
    )
    .eq('status', 'pending')
    .lte('send_on', today)
    .limit(5000);

  if (error) throw new Error(`cron select: ${error.message}`);

  const rows = (data ?? []) as unknown as QueueRow[];

  // ---- ทิ้งแถวที่ไม่ควรส่ง ก่อนจะเสียเงินค่าข้อความ ----
  const skip: string[] = [];
  const live: QueueRow[] = [];
  for (const r of rows) {
    const doc = r.documents;
    const usr = r.users;
    const dead =
      !doc || doc.archived_at !== null ||          // "ไม่ได้ใช้รถคันนี้แล้ว"
      !doc.confirmed_by_user ||                    // ยังไม่กดยืนยัน = ยังไม่รับประกันความถูกต้อง
      !usr || usr.unfollowed_at !== null || usr.deleted_at !== null;
    if (dead) skip.push(r.id);
    else live.push(r);
  }
  if (skip.length) {
    await supabase.from('reminder_queue').update({ status: 'skipped' }).in('id', skip);
  }

  // ---- กฎข้อ 4: group ตาม user ก่อนส่ง ----
  const byUser = new Map<string, { upcoming: QueueRow[]; due: QueueRow[] }>();
  for (const r of live) {
    let bucket = byUser.get(r.line_user_id);
    if (!bucket) { bucket = { upcoming: [], due: [] }; byUser.set(r.line_user_id, bucket); }
    bucket[r.kind].push(r);
  }

  let sentMessages = 0;
  let sentUsers = 0;
  const failed: string[] = [];

  for (const [userId, bucket] of byUser) {
    const ok: string[] = [];
    try {
      if (bucket.upcoming.length) {
        const items = bucket.upcoming.map(toItem);
        // พิกัดหยาบที่เขาเคยแชร์ไว้ — ทำให้ลิงก์ "ใกล้ฉัน" ค้นรอบตัวเขาจริง ๆ
        // ไม่มีก็ยังกดได้ แค่ Maps ใช้ตำแหน่งของเครื่องเป็นจุดตั้งต้นแทน
        const area = await getUserArea(userId);
        await push(userId, upcomingReminder(items, today, actionsByType, area));
        sentMessages++;
        ok.push(...bucket.upcoming.map((r) => r.id));
      }
      if (bucket.due.length) {
        const items = bucket.due.map(toItem);
        await push(userId, dueReminder(items));
        sentMessages++;
        ok.push(...bucket.due.map((r) => r.id));
      }
      sentUsers++;

      await supabase
        .from('reminder_queue')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .in('id', ok);

      await track('reminder_sent', userId, {
        upcoming: bucket.upcoming.length,
        due: bucket.due.length,
        messages: (bucket.upcoming.length ? 1 : 0) + (bucket.due.length ? 1 : 0),
      });
    } catch (err) {
      failed.push(userId);
      const ids = [...bucket.upcoming, ...bucket.due].map((r) => r.id);
      await supabase
        .from('reminder_queue')
        .update({ status: 'failed', error: String(err).slice(0, 500) })
        .in('id', ids);
      console.error('[cron] push failed', userId, err);
    }
  }

  const summary = {
    today,
    queued: rows.length,
    skipped: skip.length,
    users: sentUsers,
    messages: sentMessages,
    failed: failed.length,
    // ต้นทุนจริงของรอบนี้ — ดูได้ทุกวันว่าเงินไปไหน
    estimated_cost_thb: Number((sentMessages * 0.06).toFixed(2)),
  };
  await track('cron_run', null, summary);

  // ล้างรูปที่เลยกำหนดเก็บ — ทำท้ายรอบนี้แทนการกิน cron slot ไปอีกอัน
  // (Vercel Hobby ให้แค่ 2 slot และเราต้องใช้กับรอบเตือนทั้งคู่)
  // ตอนนี้เป็น no-op เพราะเราไม่เก็บรูปเลย แต่เผื่ออนาคตเปลี่ยนใจ
  try {
    const { data: stale } = await supabase
      .from('documents')
      .select('id, image_path')
      .not('image_path', 'is', null)
      .lte('image_purge_after', today)
      .limit(500);
    for (const r of (stale as Array<{ id: string; image_path: string }>) ?? []) {
      await supabase.storage.from('documents').remove([r.image_path]).catch(() => {});
      await supabase.from('documents').update({ image_path: null, image_purge_after: null }).eq('id', r.id);
    }
  } catch (err) {
    console.error('[cron] purge images failed', err);
  }

  return summary;
}

function toItem(r: QueueRow): ReminderItem {
  return {
    documentId: r.document_id,
    typeKey: r.documents!.doc_type,
    label: r.documents!.label,
    expiry: r.documents!.expiry_date,
    offsetDays: r.offset_days,
  };
}
