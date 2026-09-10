/**
 * ทะเบียนประเภทเอกสาร — จุดเดียวที่กำหนดว่าระบบรับเตือนอะไรบ้าง
 *
 * หลักการ (ตัดสินไว้แล้ว อย่าเปลี่ยนโดยไม่คิด):
 *   รับเตือน "ทุกอย่างที่มีวันหมดอายุ" แต่ลงแรงสร้าง flow เฉพาะที่มีเงินปลายทาง
 *
 *   tier 1 — มีเงินทันที      : OCR เต็ม + ปุ่มขาย
 *   tier 2 — ยังไม่มีเงิน      : รับเข้าระบบ ไม่ต้อง OCR สมบูรณ์ ไม่มีปุ่มขาย
 *                               (หลายตัวจะเลื่อนขึ้น tier 1 เมื่อมีคู่ค้า)
 *   tier 3 — ผู้ใช้พิมพ์เอง    : ไม่ OCR เลย — และคือ roadmap ที่ผู้ใช้เขียนให้ฟรี
 *
 * offsets: ลบ = ก่อนหมดอายุ, บวก = หลังครบกำหนด
 * ปุ่มขายต้องอยู่บน tier 1 เท่านั้น (มี test บังคับไว้)
 */

export type Tier = 1 | 2 | 3;

export interface DocType {
  key: string;
  label: string;
  emoji: string;
  tier: Tier;
  /** วันที่จะเตือน เทียบกับ expiry_date */
  offsets: number[];
  /** อายุปกติของเอกสาร ใช้ตอนผู้ใช้กด "ต่อแล้ว" เพื่อเลื่อนวันอัตโนมัติ */
  termMonths?: number;
  /** ต่อล่วงหน้าได้กี่วัน — ใช้เขียนข้อความ "ต่อได้ตั้งแต่วันนี้แล้ว" */
  renewWindowDays?: number;
  /** ปุ่มขายในข้อความเตือน — tier 1 เท่านั้น */
  upsell?: { label: string; price?: number };
  /** ส่งรูปเข้า OCR หรือให้ผู้ใช้เลือกวันที่เอง */
  ocr: boolean;
  /** ข้อความช่วยตอนขอรูป */
  hint?: string;
}

export const DOC_TYPES: DocType[] = [
  // ---------------- tier 1 : มีเงินทันที ----------------
  {
    key: 'vehicle_tax', label: 'ภาษีรถ', emoji: '📄', tier: 1,
    offsets: [-90, -30, -7, 1], termMonths: 12, renewWindowDays: 90, ocr: true,
    upsell: { label: 'ให้เราต่อให้', price: 350 },
    hint: 'ถ่ายป้ายภาษี หรือหน้าเล่มทะเบียนที่มีวันหมดอายุ',
  },
  {
    key: 'cmi', label: 'พ.ร.บ.', emoji: '🛡', tier: 1,
    offsets: [-90, -30, -7, 1], termMonths: 12, renewWindowDays: 90, ocr: true,
    upsell: { label: 'ให้เราต่อให้', price: 350 },
    hint: 'ถ่ายหน้าตารางกรมธรรม์ พ.ร.บ.',
  },
  {
    key: 'motor_insurance', label: 'ประกันรถ', emoji: '📗', tier: 1,
    offsets: [-45, -14, -3, 1], termMonths: 12, ocr: true,
    upsell: { label: 'ให้เราเทียบราคาให้' },
    hint: 'ถ่ายหน้าตารางกรมธรรม์',
  },
  {
    key: 'vehicle_inspection', label: 'ตรวจสภาพรถ (ตรอ.)', emoji: '🔧', tier: 1,
    offsets: [-30, -7, 1], termMonths: 12, ocr: true,
  },
  {
    key: 'driving_license', label: 'ใบขับขี่', emoji: '🚗', tier: 1,
    offsets: [-90, -30, -7, 1], termMonths: 60, renewWindowDays: 90, ocr: true,
    hint: 'ถ่ายด้านหน้าใบขับขี่',
  },

  // ---------------- tier 2 : ยังไม่มีเงิน แต่คือเหตุผลที่เขาอยู่ ----------------
  {
    // เอกสารที่คนไทยมีกันทุกคน — ควรอยู่ในระบบตั้งแต่แรก
    // ต่อได้ล่วงหน้า 60 วัน · เลยกำหนดเกิน 60 วันมีค่าปรับ
    key: 'national_id', label: 'บัตรประชาชน', emoji: '🪪', tier: 2,
    offsets: [-60, -30, -7, 1], termMonths: 96, renewWindowDays: 60, ocr: true,
    hint: 'ถ่ายด้านหน้าบัตร ให้เห็นวันหมดอายุชัด ๆ',
  },
  {
    key: 'passport', label: 'พาสปอร์ต', emoji: '📕', tier: 2,
    // เตือนตั้งแต่เหลือ 9 เดือน — ช่วงเวลาเดียวที่ไม่มีใครในโลกเตือนเขา
    offsets: [-270, -180, -90, 1], termMonths: 120, ocr: true,
    hint: 'ถ่ายหน้าที่มีรูปและวันหมดอายุ',
  },
  { key: 'visa', label: 'วีซ่า', emoji: '🛂', tier: 2, offsets: [-60, -30, -7, 1], ocr: true },
  { key: 'work_permit', label: 'ใบอนุญาตทำงาน', emoji: '💼', tier: 2, offsets: [-60, -30, -7, 1], termMonths: 12, ocr: true },
  { key: 'health_insurance', label: 'ประกันสุขภาพ', emoji: '🏥', tier: 2, offsets: [-45, -14, 1], termMonths: 12, ocr: true },
  { key: 'life_insurance', label: 'ประกันชีวิต', emoji: '📘', tier: 2, offsets: [-45, -14, 1], termMonths: 12, ocr: true },
  { key: 'social_security', label: 'ประกันสังคม ม.39/40', emoji: '🧾', tier: 2, offsets: [-30, -7, 1], termMonths: 12, ocr: false },
  { key: 'professional_license', label: 'ใบอนุญาตวิชาชีพ', emoji: '📜', tier: 2, offsets: [-90, -30, -7, 1], ocr: true },
  { key: 'lease', label: 'สัญญาเช่า', emoji: '🏠', tier: 2, offsets: [-60, -30, -7, 1], termMonths: 12, ocr: false },

  // ---------------- tier 3 : ผู้ใช้พิมพ์เองอะไรก็ได้ ----------------
  {
    key: 'custom', label: 'อื่น ๆ', emoji: '🔔', tier: 3,
    offsets: [-30, -7, 1], ocr: false,
  },
];

const BY_KEY = new Map(DOC_TYPES.map((t) => [t.key, t]));

export function docType(key: string): DocType {
  return BY_KEY.get(key) ?? BY_KEY.get('custom')!;
}

export function isKnownDocType(key: string): boolean {
  return BY_KEY.has(key);
}

/** ประเภทที่เสนอเป็นชิปหลังบันทึกใบแรก (ฉาก 03) */
export const SUGGEST_AFTER_FIRST = ['cmi', 'motor_insurance', 'driving_license', 'passport'];

/** ตัวเลือกที่ให้ผู้ใช้กดตอนเราเดาประเภทไม่ออก */
export const ASK_TYPE_CHOICES = [
  'vehicle_tax', 'cmi', 'motor_insurance', 'driving_license',
  'national_id', 'passport', 'health_insurance', 'custom',
];

/** ชื่อเต็มที่ใช้แสดง เช่น "📄 ภาษีรถ · 1กก 1234" */
export function displayName(typeKey: string, label?: string | null): string {
  const t = docType(typeKey);
  return label ? `${t.emoji} ${t.label} · ${label}` : `${t.emoji} ${t.label}`;
}
