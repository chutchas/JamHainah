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
