import { docType } from './docTypes';
import { ISODate, addDays, addMonths, daysBetween } from './thaiDate';

export type ReminderKind = 'upcoming' | 'due';

export interface QueueRow {
  document_id: string;
  line_user_id: string;
  send_on: ISODate;
  offset_days: number;
  kind: ReminderKind;
}

/**
 * คำนวณคิวเตือนทั้งหมดของเอกสารหนึ่งใบ — เรียกตอนบันทึก/แก้ไข/ต่ออายุ
 *
 * ทำไมคำนวณล่วงหน้าแทนที่จะให้ cron ไล่คิดทุกเช้า:
 *   cron ตอนเช้าเหลือแค่ SELECT ... WHERE send_on <= today
 *   ซึ่ง group ตาม user ได้ทันที (กฎข้อ 4 — รวมเป็นข้อความเดียว)
 */
export function computeReminders(args: {
  documentId: string;
  lineUserId: string;
  docTypeKey: string;
  expiryDate: ISODate;
  today: ISODate;
}): QueueRow[] {
  const { documentId, lineUserId, docTypeKey, expiryDate, today } = args;
  const type = docType(docTypeKey);

  const rows: QueueRow[] = [];
  const seen = new Set<string>();

  for (const offset of type.offsets) {
    const sendOn = addDays(expiryDate, offset);

    // ข้ามรอบที่เลยไปแล้ว — เอกสารที่เพิ่งใส่ตอนเหลือ 10 วัน
    // ไม่ควรได้รับการเตือน D-90 ย้อนหลัง
    if (daysBetween(today, sendOn) < 0) continue;

    const key = `${sendOn}:${offset}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      document_id: documentId,
      line_user_id: lineUserId,
      send_on: sendOn,
      offset_days: offset,
      kind: offset > 0 ? 'due' : 'upcoming',
    });
  }

  // เอกสารที่หมดอายุไปแล้วตอนที่ใส่เข้ามา — ยังต้องถามว่าต่อหรือยัง
  // ไม่งั้นมันจะนอนนิ่งในฐานข้อมูลตลอดไปโดยไม่มีใครแตะ
  if (rows.length === 0) {
    rows.push({
      document_id: documentId,
      line_user_id: lineUserId,
      send_on: addDays(today, 1),
      offset_days: 1,
      kind: 'due',
    });
  }

  return rows.sort((a, b) => a.send_on.localeCompare(b.send_on));
}

/**
 * ผู้ใช้กด "ต่อแล้ว" (ฉาก 08) — เลื่อนวันหมดอายุไปอีกหนึ่งรอบ
 *
 * นี่คือกลไกที่ทำให้ฐานข้อมูลไม่ตายภายในหนึ่งรอบปี
 * ผู้ใช้กดปุ่มเดียว ไม่ต้องอัปโหลดเอกสารใหม่
 *
 * ฐานคือวันหมดอายุเดิม (ไม่ใช่วันนี้) เพราะการต่อภาษีนับต่อจากวันเดิม
 * แต่ถ้าเขาปล่อยขาดมานานจนบวกแล้วยังไม่ถึงอนาคต ให้บวกต่อจนพ้นวันนี้
 */
export function rolloverExpiry(args: {
  docTypeKey: string;
  currentExpiry: ISODate;
  today: ISODate;
}): ISODate | null {
  const type = docType(args.docTypeKey);
  if (!type.termMonths) return null; // ไม่รู้อายุปกติ — ต้องถามผู้ใช้

  let next = addMonths(args.currentExpiry, type.termMonths);
  let guard = 0;
  while (daysBetween(args.today, next) <= 0 && guard < 50) {
    next = addMonths(next, type.termMonths);
    guard++;
  }
  return next;
}

/** ข้อความบรรทัดแรกของการเตือน ต่างกันตามความใกล้ */
export function urgencyOf(offsetDays: number): 'early' | 'soon' | 'urgent' | 'overdue' {
  if (offsetDays > 0) return 'overdue';
  if (offsetDays <= -60) return 'early';
  if (offsetDays <= -14) return 'soon';
  return 'urgent';
}


/* ============================================================
 * วันหมดอายุเปลี่ยนไป แปลว่าอะไร
 * ============================================================
 *
 * เอกสารใบเดิมแต่วันไม่ตรง เป็นได้ 3 อย่าง และแยกให้ออกสำคัญมาก
 * เพราะ renewed_count เป็นตัวเลขทางธุรกิจ (v_shop_performance ใช้วัดว่า
 * ร้านไหนส่งลูกค้ากลับมาต่ออายุได้จริง) — นับการแก้คำผิดเป็นการต่ออายุ
 * ตัวเลขที่เอาไปคุยกับร้านจะเพี้ยนทันที
 */

/** ต่างกันไม่เกินนี้ = แก้วันที่ที่เคยบันทึกผิด ไม่ใช่ต่ออายุ */
export const CORRECTION_WINDOW_DAYS = 45;
/** รู้อายุปกติของเอกสาร: ต่างกันตั้งแต่สัดส่วนนี้ของหนึ่งรอบ = ต่ออายุ */
export const RENEWAL_RATIO = 0.7;
/** ไม่รู้อายุปกติ: ใช้เกณฑ์นี้แทน */
export const RENEWAL_MIN_DAYS = 180;

export type ExpiryChange = 'same' | 'correction' | 'renewal' | 'unclear';

export function classifyExpiryChange(args: {
  docTypeKey: string;
  from: ISODate;
  to: ISODate;
}): ExpiryChange {
  const gap = daysBetween(args.from, args.to);
  if (gap === 0) return 'same';

  // วันใหม่ย้อนหลังกว่าเดิม — ต่ออายุถอยหลังไม่ได้ ต้องเป็นการแก้
  if (gap < 0) return 'correction';

  // ขยับไม่กี่วัน/ไม่กี่สัปดาห์ — OCR อ่านเลขผิดตัวเดียวก็เป็นแบบนี้ได้
  if (gap <= CORRECTION_WINDOW_DAYS) return 'correction';

  const term = docType(args.docTypeKey).termMonths;
  if (term) {
    const expected = term * 30.44;
    if (gap >= expected * RENEWAL_RATIO) return 'renewal';
    // ห่างเกินกว่าจะเป็นคำผิด แต่ไม่ถึงหนึ่งรอบ — เดาไม่ได้
    return 'unclear';
  }

  return gap >= RENEWAL_MIN_DAYS ? 'renewal' : 'unclear';
}
