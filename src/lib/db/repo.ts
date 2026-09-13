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

/* ---------------- เพดานการใช้ AI ---------------- */

/**
 * นับจำนวนครั้งที่เรายิงเข้า OpenAI ให้ผู้ใช้คนนี้ใน 24 ชั่วโมงที่ผ่านมา
 *
 * ทำไมต้องมี: ทุกครั้งที่อ่านรูปหนึ่งใบ เราจ่ายเงินจริง และไม่มีอะไรกั้น
 * คนเดียวเปิดอัลบั้มแล้วส่งรวดร้อยใบ ก็จ่ายจริงร้อยครั้งภายในนาทีเดียว
 * ไม่ว่าจะตั้งใจแกล้งหรือแค่เลือกรูปพลาด
 *
 * นับจาก events แทนการทำตารางใหม่ เพราะ track() บันทึกทุกครั้งอยู่แล้ว
 * และมี index (line_user_id, created_at desc) รองรับการนับแบบนี้พอดี
 */
export async function countAiCalls(lineUserId: string, hours = 24): Promise<number> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { count } = await db()
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('line_user_id', lineUserId)
    .eq('name', 'ai_call')
    .gte('created_at', since);
  return count ?? 0;
}

/* ---------------- ผู้ดูแลระบบ ---------------- */

export interface AdminRow {
  line_user_id: string;
  display_name: string | null;
  role: 'owner' | 'staff';
  added_by: string | null;
  note: string | null;
  created_at: string;
  disabled_at: string | null;
}

export async function findAdmin(lineUserId: string): Promise<AdminRow | null> {
  const { data } = await db()
    .from('admins').select('*').eq('line_user_id', lineUserId).maybeSingle();
  return (data as AdminRow) ?? null;
}

export async function listAdmins(): Promise<AdminRow[]> {
  const { data } = await db().from('admins').select('*').order('created_at');
  return (data as AdminRow[]) ?? [];
}

export async function upsertAdmin(args: {
  lineUserId: string; role: 'owner' | 'staff'; displayName?: string | null;
  note?: string | null; addedBy: string;
}): Promise<AdminRow> {
  const { data, error } = await db()
    .from('admins')
    .upsert({
      line_user_id: args.lineUserId,
      role: args.role,
      display_name: args.displayName ?? null,
      note: args.note ?? null,
      added_by: args.addedBy,
      // เพิ่มคนที่เคยถูกถอดสิทธิ์ = เปิดใช้ใหม่ ไม่ใช่สร้างแถวซ้ำ
      disabled_at: null,
    })
    .select()
    .single();
  if (error) throw new Error(`upsertAdmin: ${error.message}`);
  return data as AdminRow;
}

/** ถอดสิทธิ์ = ปิด ไม่ใช่ลบ — ประวัติว่าใครเคยทำอะไรต้องยังอ่านออก */
export async function disableAdmin(lineUserId: string): Promise<void> {
  const { error } = await db()
    .from('admins').update({ disabled_at: new Date().toISOString() }).eq('line_user_id', lineUserId);
  if (error) throw new Error(`disableAdmin: ${error.message}`);
}

/* ---------------- ร่องรอยว่าใครทำอะไร ---------------- */

/**
 * ทุกการเขียนของฝั่งหลังบ้านต้องผ่านที่นี่
 *
 * เก็บ before/after ทั้งก้อน เพราะตอนที่ต้องใช้จริง เราจะไม่รู้ล่วงหน้า
 * ว่าต้องดู field ไหน และของที่ไม่ได้เก็บ ย้อนไปเก็บไม่ได้
 */
export async function audit(args: {
  actor: string;
  action: string;
  entity?: string | null;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  try {
    await db().from('audit_log').insert({
      actor: args.actor,
      action: args.action,
      entity: args.entity ?? null,
      before: args.before ?? null,
      after: args.after ?? null,
    });
  } catch (err) {
    // บันทึกไม่ได้ ต้องไม่ทำให้งานหลักล้ม แต่ต้องดังใน log ให้เห็น
    console.error('[audit] failed', args.action, err);
  }
}

/* ---------------- คิวงาน ---------------- */

export interface OrderRow {
  id: string;
  line_user_id: string;
  document_id: string | null;
  service: string;
  status: 'new' | 'accepted' | 'in_progress' | 'done' | 'cancelled';
  assignee: string | null;
  price_thb: number | null;
  paid_at: string | null;
  note: string | null;
  vehicle: Record<string, unknown>;
  purge_after: string | null;
  purged_at: string | null;
  created_at: string;
  updated_at: string;
}

export const ORDER_STATUSES = ['new', 'accepted', 'in_progress', 'done', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * งานหนึ่งชิ้นต่อการกดหนึ่งครั้ง — แต่ถ้ายังมีงานเปิดค้างของเอกสารใบเดิม
 * ให้ใช้ใบเดิม ไม่ต้องเปิดใหม่ (ลูกค้ากดซ้ำเพราะไม่แน่ใจว่ากดติดไหม)
 */
export async function openOrder(args: {
  lineUserId: string; documentId?: string | null; service: string; via: string;
}): Promise<OrderRow> {
  if (args.documentId) {
    const { data: existing } = await db()
      .from('orders').select('*')
      .eq('line_user_id', args.lineUserId)
      .eq('document_id', args.documentId)
      .in('status', ['new', 'accepted', 'in_progress'])
      .maybeSingle();
    if (existing) return existing as OrderRow;
  }

  const { data, error } = await db()
    .from('orders')
    .insert({
      line_user_id: args.lineUserId,
      document_id: args.documentId ?? null,
      service: args.service,
    })
    .select()
    .single();
  if (error) throw new Error(`openOrder: ${error.message}`);

  const row = data as OrderRow;
  await db().from('order_events').insert({
    order_id: row.id, kind: 'created', detail: { via: args.via },
  });
  return row;
}

export async function listOrders(limit = 50): Promise<OrderRow[]> {
  const { data } = await db()
    .from('orders').select('*').order('created_at', { ascending: false }).limit(limit);
  return (data as OrderRow[]) ?? [];
}

export async function getOrder(id: string): Promise<OrderRow | null> {
  const { data } = await db().from('orders').select('*').eq('id', id).maybeSingle();
  return (data as OrderRow) ?? null;
}

export async function setOrderStatus(args: {
  id: string; status: OrderStatus; actor: string; note?: string | null;
}): Promise<OrderRow> {
  const patch: Record<string, unknown> = { status: args.status, assignee: args.actor };
  if (args.note !== undefined) patch.note = args.note;
  /**
   * งานจบแล้วตั้งเวลาล้างข้อมูลรถ — เก็บเท่าที่ต้องใช้ ลบเมื่องานจบ
   * เว้น 7 วันไว้เผื่อลูกค้าทักกลับมาถามเรื่องงานที่เพิ่งปิด
   */
  if (args.status === 'done' || args.status === 'cancelled') {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    patch.purge_after = d.toISOString().slice(0, 10);
  }

  const { data, error } = await db()
    .from('orders').update(patch).eq('id', args.id).select().single();
  if (error) throw new Error(`setOrderStatus: ${error.message}`);

  await db().from('order_events').insert({
    order_id: args.id, actor: args.actor, kind: 'status', detail: { status: args.status },
  });
  return data as OrderRow;
}

export async function listOrderEvents(orderId: string) {
  const { data } = await db()
    .from('order_events').select('*').eq('order_id', orderId).order('at', { ascending: true });
  return (data as Array<{ kind: string; actor: string | null; detail: Record<string, unknown>; at: string }>) ?? [];
}

/**
 * ล้างข้อมูลรถของงานที่จบแล้ว — เรียกจาก cron รอบเช้า
 * ข้อมูลที่ยืมมาทำงานหนึ่งครั้ง ต้องคืนโดยไม่ต้องรอให้ใครสั่ง
 */
export async function purgeFinishedOrders(today: string): Promise<number> {
  const { data } = await db()
    .from('orders')
    .select('id')
    .is('purged_at', null)
    .not('purge_after', 'is', null)
    .lte('purge_after', today)
    .limit(500);

  const ids = ((data as Array<{ id: string }>) ?? []).map((r) => r.id);
  if (ids.length === 0) return 0;

  await db()
    .from('orders')
    .update({ vehicle: {}, purged_at: new Date().toISOString() })
    .in('id', ids);
  return ids.length;
}

/* ---------------- PDPA ---------------- */

export async function hardDeleteUser(lineUserId: string) {
  const supabase = db();
  // documents / reminder_queue มี on delete cascade อยู่แล้ว
  await supabase.from('documents').delete().eq('line_user_id', lineUserId);
  await supabase.from('users').update({ deleted_at: new Date().toISOString(), pending: {} }).eq('line_user_id', lineUserId);
}
