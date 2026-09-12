import { db } from './client';
import { computeReminders, classifyExpiryChange } from '@/lib/domain/reminders';
import { docType as docTypeOf } from '@/lib/domain/docTypes';
import type { ISODate } from '@/lib/domain/thaiDate';

/**
 * ที่มาของเอกสารหนึ่งใบ
 *
 * รายการนี้ต้องตรงกับ check constraint documents_source_check ใน migration เสมอ
 * เคยไม่ตรงมาแล้ว: โค้ดส่ง 'text' แต่ constraint รู้จักแค่ ocr/manual/rollover
 * ทุก insert จากทางพิมพ์ข้อความจึงถูกฐานข้อมูลปฏิเสธ และผู้ใช้เห็นแค่
 * "ระบบมีปัญหาชั่วคราว" โดยไม่มีใครรู้ว่าทางเข้านั้นตายไปแล้ว
 * มี test/document-source.test.ts คอยเทียบสองที่นี้ให้
 */
export const DOC_SOURCES = ['ocr', 'text', 'manual', 'rollover'] as const;
export type DocSource = (typeof DOC_SOURCES)[number];

export interface DocumentRow {
  id: string;
  line_user_id: string;
  doc_type: string;
  label: string | null;
  expiry_date: ISODate;
  confirmed_by_user: boolean;
  source: string;
  image_path: string | null;
  meta: Record<string, unknown>;
  renewed_count: number;
  archived_at: string | null;
  created_at: string;
}

export interface PendingState {
  awaiting?: 'image' | 'date' | 'type';
  docTypeKey?: string;
  documentId?: string;
  /** สิ่งที่ OCR อ่านได้แล้ว — เก็บไว้เพื่อไม่ให้ผู้ใช้ต้องกรอกซ้ำ */
  expiryDate?: string;
  label?: string;
  at?: string;
}

/* ---------------- users ---------------- */

export async function upsertUser(lineUserId: string, displayName?: string | null) {
  const { error } = await db()
    .from('users')
    .upsert(
      { line_user_id: lineUserId, display_name: displayName ?? null, unfollowed_at: null, deleted_at: null },
      { onConflict: 'line_user_id' }
    );
  // เดิมฟังก์ชันนี้กลืน error เงียบ ๆ ทำให้ขั้นถัดไปพังโดยไม่รู้ว่าต้นเหตุอยู่ตรงนี้
  if (error) throw new Error(`upsertUser: ${error.message}`);
}

export async function markUnfollowed(lineUserId: string) {
  await db().from('users').update({ unfollowed_at: new Date().toISOString() }).eq('line_user_id', lineUserId);
}

export async function getPending(lineUserId: string): Promise<PendingState> {
  const { data } = await db().from('users').select('pending').eq('line_user_id', lineUserId).maybeSingle();
  return (data?.pending as PendingState) ?? {};
}

export async function setPending(lineUserId: string, pending: PendingState | null) {
  const { error } = await db()
    .from('users')
    .update({ pending: pending ?? {} })
    .eq('line_user_id', lineUserId);
  if (error) throw new Error(`setPending: ${error.message}`);
}

/**
 * บันทึกพื้นที่ของผู้ใช้ — ปัดพิกัดเหลือทศนิยม 2 ตำแหน่ง (~1 กม.) โดยตั้งใจ
 *
 * เราต้องการรู้แค่ว่าผู้ใช้กระจุกอยู่โซนไหน เพื่อไปหาร้านแถวนั้นมาเป็นพาร์ทเนอร์
 * ไม่ได้ต้องการรู้ว่าใครอยู่บ้านเลขที่ไหน
 */
export async function saveUserArea(lineUserId: string, args: {
  lat: number; lng: number; label?: string | null;
}) {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  await db().from('users').update({
    area_lat: round2(args.lat),
    area_lng: round2(args.lng),
    area_label: args.label ?? null,
    area_shared_at: new Date().toISOString(),
  }).eq('line_user_id', lineUserId);
}

/** พิกัดหยาบที่เคยเก็บไว้ — ใช้ปักหมุดลิงก์แผนที่ให้ตรงขึ้นโดยไม่ต้องถามซ้ำทุกครั้ง */
export async function getUserArea(
  lineUserId: string
): Promise<{ lat: number; lng: number } | null> {
  const { data } = await db()
    .from('users')
    .select('area_lat, area_lng')
    .eq('line_user_id', lineUserId)
    .maybeSingle();
  const r = data as { area_lat: number | null; area_lng: number | null } | null;
  if (!r || r.area_lat == null || r.area_lng == null) return null;
  return { lat: Number(r.area_lat), lng: Number(r.area_lng) };
}

/** จับคู่ผู้ใช้กับร้านที่เขาสแกน QR มา (ภายใน 24 ชม.) */
export async function attachShopAttribution(lineUserId: string) {
  const supabase = db();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data } = await supabase
    .from('shop_scans')
    .select('shop_id')
    .eq('line_user_id', lineUserId)
    .gte('scanned_at', since)
    .order('scanned_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.shop_id) {
    await supabase.from('users').update({ referred_by_shop_id: data.shop_id }).eq('line_user_id', lineUserId);
  }
}

/* ---------------- documents ---------------- */

export async function createDocument(args: {
  lineUserId: string;
  docTypeKey: string;
  label?: string | null;
  expiryDate: ISODate;
  confirmed: boolean;
  /** ocr = อ่านจากรูป · text = ผู้ใช้พิมพ์บอก · manual = เลือกวันจากปฏิทินเอง */
  source: DocSource;
  meta?: Record<string, unknown>;
  imagePath?: string | null;
}): Promise<DocumentRow> {
  const purge = new Date();
  purge.setDate(purge.getDate() + 30); // PDPA: ลบรูปต้นฉบับใน 30 วัน

  // เอกสารที่คนหนึ่งมีได้ใบเดียว ไม่มีอะไรให้แยกแยะ label จึงไม่มีประโยชน์
  // และมักกลายเป็นชื่อเอกสารซ้ำ เช่น "บัตรประชาชน · บัตรประจำตัวประชาชน"
  const label = docTypeOf(args.docTypeKey).singleton ? null : (args.label ?? null);

  const { data, error } = await db()
    .from('documents')
    .insert({
      line_user_id: args.lineUserId,
      doc_type: args.docTypeKey,
      label,
      expiry_date: args.expiryDate,
      confirmed_by_user: args.confirmed,
      source: args.source,
      meta: args.meta ?? {},
      image_path: args.imagePath ?? null,
      image_purge_after: args.imagePath ? purge.toISOString().slice(0, 10) : null,
    })
    .select()
    .single();
  if (error) throw new Error(`createDocument: ${error.message}`);
  return data as DocumentRow;
}

/** ผลการเทียบกับเอกสารที่มีอยู่แล้ว */
export type MatchKind = 'none' | 'duplicate' | 'renewal' | 'correction' | 'ambiguous';
export type AmbiguousReason = 'no_label' | 'unclear_gap';

const normLabel = (v?: string | null) =>
  (v ?? '').replace(/[\s\-.]/g, '').toLowerCase();

/**
 * เอกสารที่ส่งเข้ามาใหม่ ตรงกับใบไหนที่มีอยู่แล้วหรือเปล่า
 *
 *   duplicate  ใบเดิมเป๊ะ ๆ — ส่งซ้ำ ไม่ต้องบันทึกอีก
 *   renewal    ใบเดิมแต่วันหมดอายุใหม่ — เขาต่ออายุมาแล้ว ให้เลื่อนวันของใบเดิม
 *   ambiguous  มีใบของประเภทนี้อยู่ แต่ไม่มีเลขให้เทียบ — เดาไม่ได้ ต้องถาม
 *   none       ของใหม่จริง
 *
 * ทำไมต้องแยก renewal ออกมา: ถ้าปล่อยให้สร้างใบที่สอง ผู้ใช้จะถูกเตือน
 * ด้วยวันเก่าที่ผ่านไปแล้วตลอดไป และรายการจะรกขึ้นทุกปี
 */
export async function resolveExisting(args: {
  lineUserId: string;
  docTypeKey: string;
  label?: string | null;
  expiryDate: ISODate;
}): Promise<{ kind: MatchKind; doc?: DocumentRow; reason?: AmbiguousReason }> {
  const { data } = await db()
    .from('documents')
    .select('*')
    .eq('line_user_id', args.lineUserId)
    .eq('doc_type', args.docTypeKey)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  const rows = (data as DocumentRow[]) ?? [];
  if (rows.length === 0) return { kind: 'none' };

  const type = docTypeOf(args.docTypeKey);
  const verdict = (doc: DocumentRow): { kind: MatchKind; doc: DocumentRow; reason?: AmbiguousReason } => {
    const change = classifyExpiryChange({
      docTypeKey: args.docTypeKey,
      from: doc.expiry_date,
      to: args.expiryDate,
    });
    if (change === 'same') return { kind: 'duplicate', doc };
    if (change === 'correction') return { kind: 'correction', doc };
    if (change === 'renewal') return { kind: 'renewal', doc };
    return { kind: 'ambiguous', doc, reason: 'unclear_gap' };
  };

  // คนหนึ่งมีใบเดียว — ไม่ต้องดูเลขอะไรทั้งนั้น
  if (type.singleton) return verdict(rows[0]);

  // มีเลขให้เทียบ (ทะเบียนรถ / เลขกรมธรรม์) — แม่นที่สุด
  const incoming = normLabel(args.label);
  if (incoming) {
    const sameLabel = rows.find((r) => normLabel(r.label) === incoming);
    if (sameLabel) return verdict(sameLabel);
    return { kind: 'none' }; // คนละทะเบียน = คนละคัน
  }

  // ไม่มีเลขให้เทียบ
  const sameDate = rows.find((r) => r.expiry_date === args.expiryDate);
  if (sameDate) return { kind: 'duplicate', doc: sameDate };

  // มีใบของประเภทนี้อยู่ใบเดียว วันไม่ตรง — ต่ออายุ หรือคนละคัน? เดาไม่ได้
  if (rows.length === 1) return { kind: 'ambiguous', doc: rows[0], reason: 'no_label' };

  return { kind: 'none' };
}

export async function getDocument(id: string): Promise<DocumentRow | null> {
  const { data } = await db().from('documents').select('*').eq('id', id).maybeSingle();
  return (data as DocumentRow) ?? null;
}

export async function listDocuments(lineUserId: string): Promise<DocumentRow[]> {
  const { data } = await db()
    .from('documents')
    .select('*')
    .eq('line_user_id', lineUserId)
    .is('archived_at', null)
    .order('expiry_date', { ascending: true });
  return (data as DocumentRow[]) ?? [];
}

/**
 * ใบที่ยังไม่ได้กดยืนยัน — ใช้ตอนกด "ถูกต้องทั้งหมด"
 *
 * ไม่ส่ง id ไปกับปุ่ม เพราะ postback data ยาวได้ 300 ตัวอักษร
 * uuid สิบใบก็เกินแล้ว และถ้าเกินมันจะเงียบไปเฉย ๆ ไม่มี error ให้เห็น
 */
/**
 * ใบที่ "อยู่ในชุดเดียวกัน" กับใบล่าสุด และยังไม่ได้กดถูกต้อง
 *
 * ทำไมต้องยึดจากใบล่าสุด ไม่ใช่จากเวลาปัจจุบัน:
 *   ปุ่มถูกสร้างตอนตอบ แต่ถูกกดทีหลัง — บางทีอีกห้านาที
 *   ถ้าคิดจาก now() ปุ่ม "ถูกต้องทั้งหมด" จะหาใบไม่เจอแล้วกลายเป็นปุ่มที่กดแล้วไม่เกิดอะไร
 *   ยึดจาก created_at ของใบล่าสุด ผลลัพธ์จึงเท่าเดิมไม่ว่าจะกดเมื่อไหร่
 *
 * ทำไมต้องจำกัดช่วงเวลาและจำนวน:
 *   ใบที่ค้างไม่ยืนยันจากเมื่อเดือนที่แล้วไม่ควรโผล่มาปนกับรูปที่เพิ่งส่ง
 *   และ quick reply ของ LINE ใส่ได้ 13 ปุ่ม — 4 ใบคือ 10 ปุ่มพอดี
 */
export async function recentUnconfirmed(
  lineUserId: string,
  withinSeconds = 60,
  limit = 4
): Promise<DocumentRow[]> {
  const { data } = await db()
    .from('documents')
    .select('*')
    .eq('line_user_id', lineUserId)
    .eq('confirmed_by_user', false)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(20);

  const rows = (data as DocumentRow[]) ?? [];
  if (rows.length === 0) return [];

  const newest = Date.parse(rows[0].created_at);
  return rows
    .filter((r) => newest - Date.parse(r.created_at) <= withinSeconds * 1000)
    .slice(0, limit)
    // เรียงเก่าไปใหม่ ให้ตรงลำดับการ์ดที่เขาเห็นในแชท
    .reverse();
}

export async function listUnconfirmed(lineUserId: string): Promise<DocumentRow[]> {
  const { data } = await db()
    .from('documents')
    .select('*')
    .eq('line_user_id', lineUserId)
    .eq('confirmed_by_user', false)
    .is('archived_at', null)
    .order('created_at', { ascending: true });
  return (data as DocumentRow[]) ?? [];
}

/** ประเภทเอกสารที่ผู้ใช้มีอยู่แล้ว — ใช้กันการชวนเพิ่มของที่มีแล้ว */
export async function listDocTypeKeys(lineUserId: string): Promise<string[]> {
  const { data } = await db()
    .from('documents')
    .select('doc_type')
    .eq('line_user_id', lineUserId)
    .is('archived_at', null);
  return [...new Set(((data as Array<{ doc_type: string }>) ?? []).map((r) => r.doc_type))];
}

export async function countDocuments(lineUserId: string): Promise<number> {
  const { count } = await db()
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('line_user_id', lineUserId)
    .is('archived_at', null);
  return count ?? 0;
}

export async function updateDocument(id: string, patch: Partial<DocumentRow>) {
  const { error } = await db().from('documents').update(patch).eq('id', id);
  if (error) throw new Error(`updateDocument: ${error.message}`);
}

export async function archiveDocument(id: string) {
  const { error } = await db()
    .from('documents')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`archiveDocument: ${error.message}`);
  await cancelPendingReminders(id);
}

/* ---------------- reminder queue ---------------- */

export async function cancelPendingReminders(documentId: string) {
  await db().from('reminder_queue').delete().eq('document_id', documentId).eq('status', 'pending');
}

/**
 * สร้างคิวใหม่ทั้งชุดของเอกสารใบนี้ — ลบของเดิมก่อนเสมอ
 * เรียกทุกครั้งที่ยืนยัน แก้วันที่ หรือกด "ต่อแล้ว"
 */
export async function regenerateReminders(doc: DocumentRow, today: ISODate) {
  await cancelPendingReminders(doc.id);
  const rows = computeReminders({
    documentId: doc.id,
    lineUserId: doc.line_user_id,
    docTypeKey: doc.doc_type,
    expiryDate: doc.expiry_date,
    today,
  });
  if (rows.length === 0) return [];
  const { data, error } = await db().from('reminder_queue').insert(rows).select();
  if (error) throw new Error(`regenerateReminders: ${error.message}`);
  return (data as Array<(typeof rows)[number] & { id: string }>) ?? [];
}

/**
 * รอบเตือนที่ยังไม่ได้ส่งของผู้ใช้คนนี้ทั้งหมด — ดึงทีเดียวแล้วค่อยแยกตามเอกสาร
 * ถ้าไล่ยิงทีละใบ คนที่มี 8 รายการจะเปิดหน้ารายการช้าขึ้นแบบไม่มีเหตุผล
 */
export async function listPendingReminders(
  lineUserId: string
): Promise<Array<{ document_id: string; send_on: ISODate; offset_days: number }>> {
  const { data } = await db()
    .from('reminder_queue')
    .select('document_id, send_on, offset_days')
    .eq('line_user_id', lineUserId)
    .eq('status', 'pending')
    .order('send_on');
  return (data as Array<{ document_id: string; send_on: ISODate; offset_days: number }>) ?? [];
}

/**
 * ทำเครื่องหมายว่าส่งไปแล้ว — ใช้ตอนที่เราส่งการเตือนไปกับ reply แล้ว
 * ไม่งั้น cron รอบถัดไปจะส่งซ้ำอีกครั้ง และครั้งนั้นเสียเงินด้วย
 */
export async function markRemindersSent(ids: string[]) {
  if (ids.length === 0) return;
  await db()
    .from('reminder_queue')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .in('id', ids);
}

/* ---------------- events ---------------- */

export async function track(name: string, lineUserId?: string | null, props: Record<string, unknown> = {}) {
  try {
    await db().from('events').insert({ name, line_user_id: lineUserId ?? null, props });
  } catch {
    // การวัดผลต้องไม่ทำให้ flow หลักล้ม
  }
}

/* ---------------- PDPA ---------------- */

export async function hardDeleteUser(lineUserId: string) {
  const supabase = db();
  // documents / reminder_queue มี on delete cascade อยู่แล้ว
  await supabase.from('documents').delete().eq('line_user_id', lineUserId);
  await supabase.from('users').update({ deleted_at: new Date().toISOString(), pending: {} }).eq('line_user_id', lineUserId);
}
