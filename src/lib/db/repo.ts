import { db } from './client';
import { computeReminders } from '@/lib/domain/reminders';
import type { ISODate } from '@/lib/domain/thaiDate';

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
  source: 'ocr' | 'manual';
  meta?: Record<string, unknown>;
  imagePath?: string | null;
}): Promise<DocumentRow> {
  const purge = new Date();
  purge.setDate(purge.getDate() + 30); // PDPA: ลบรูปต้นฉบับใน 30 วัน

  const { data, error } = await db()
    .from('documents')
    .insert({
      line_user_id: args.lineUserId,
      doc_type: args.docTypeKey,
      label: args.label ?? null,
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
  if (rows.length === 0) return rows;
  const { error } = await db().from('reminder_queue').insert(rows);
  if (error) throw new Error(`regenerateReminders: ${error.message}`);
  return rows;
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
