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

/**
 * กลุ่มของเอกสาร — ใช้ตัดสินว่าหลังบันทึกแล้วจะชวนเพิ่มใบไหนต่อ
 *
 * เดิมโค้ดพูดว่า "รถคันเดียวมักมีหลายใบ" กับทุกเอกสาร
 * ซึ่งอ่านแล้วงงมากเวลาผู้ใช้เพิ่งบันทึกบัตรประชาชนหรือพาสปอร์ต
 */
export type DocGroup = 'vehicle' | 'identity' | 'insurance' | 'other';

export interface DocType {
  key: string;
  label: string;
  emoji: string;
  tier: Tier;
  group: DocGroup;
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
  /**
   * คนหนึ่งมีได้ใบเดียว — บัตรประชาชน ใบขับขี่ พาสปอร์ต
   * ส่งใบใหม่มา = ต่ออายุใบเดิม ไม่ใช่เพิ่มใบที่สอง
   *
   * ตรงข้ามกับเอกสารรถ ที่มีหลายใบได้เพราะมีหลายคัน
   */
  singleton?: boolean;
  /** ข้อความช่วยตอนขอรูป */
  hint?: string;
}

export const DOC_TYPES: DocType[] = [
  // ---------------- tier 1 : มีเงินทันที ----------------
  {
    key: 'vehicle_tax', label: 'ภาษีรถ', emoji: '📄', tier: 1, group: 'vehicle',
    offsets: [-90, -30, -7, 1], termMonths: 12, renewWindowDays: 90, ocr: true,
    upsell: { label: 'ให้เราต่อให้', price: 350 },
    hint: 'ถ่ายป้ายภาษี หรือหน้าเล่มทะเบียนที่มีวันหมดอายุ',
  },
  {
    key: 'cmi', label: 'พ.ร.บ.', emoji: '🛡', tier: 1, group: 'vehicle',
    offsets: [-90, -30, -7, 1], termMonths: 12, renewWindowDays: 90, ocr: true,
    upsell: { label: 'ให้เราต่อให้', price: 350 },
    hint: 'ถ่ายหน้าตารางกรมธรรม์ พ.ร.บ.',
  },
  {
    key: 'motor_insurance', label: 'ประกันรถ', emoji: '📗', tier: 1, group: 'vehicle',
    offsets: [-45, -14, -3, 1], termMonths: 12, ocr: true,
    upsell: { label: 'ให้เราเทียบราคาให้' },
    hint: 'ถ่ายหน้าตารางกรมธรรม์',
  },
  {
    key: 'vehicle_inspection', label: 'ตรวจสภาพรถ (ตรอ.)', emoji: '🔧', tier: 1, group: 'vehicle',
    offsets: [-30, -7, 1], termMonths: 12, ocr: true,
  },
  {
    key: 'driving_license', label: 'ใบขับขี่', emoji: '🚗', tier: 1, group: 'identity',
    offsets: [-90, -30, -7, 1], termMonths: 60, renewWindowDays: 90, ocr: true, singleton: true,
    hint: 'ถ่ายด้านหน้าใบขับขี่',
  },

  // ---------------- tier 2 : ยังไม่มีเงิน แต่คือเหตุผลที่เขาอยู่ ----------------
  {
    // เอกสารที่คนไทยมีกันทุกคน — ควรอยู่ในระบบตั้งแต่แรก
    // ต่อได้ล่วงหน้า 60 วัน · เลยกำหนดเกิน 60 วันมีค่าปรับ
    key: 'national_id', label: 'บัตรประชาชน', emoji: '🪪', tier: 2, group: 'identity',
    offsets: [-60, -30, -7, 1], termMonths: 96, renewWindowDays: 60, ocr: true, singleton: true,
    hint: 'ถ่ายด้านหน้าบัตร ให้เห็นวันหมดอายุชัด ๆ',
  },
  {
    key: 'passport', label: 'พาสปอร์ต', emoji: '📕', tier: 2, group: 'identity',
    // เตือนตั้งแต่เหลือ 9 เดือน — ช่วงเวลาเดียวที่ไม่มีใครในโลกเตือนเขา
    offsets: [-270, -180, -90, 1], termMonths: 120, ocr: true, singleton: true,
    hint: 'ถ่ายหน้าที่มีรูปและวันหมดอายุ',
  },
  { key: 'visa', label: 'วีซ่า', emoji: '🛂', tier: 2, group: 'identity', offsets: [-60, -30, -7, 1], ocr: true },
  { key: 'work_permit', label: 'ใบอนุญาตทำงาน', emoji: '💼', tier: 2, group: 'identity', offsets: [-60, -30, -7, 1], termMonths: 12, ocr: true },
  { key: 'health_insurance', label: 'ประกันสุขภาพ', emoji: '🏥', tier: 2, group: 'insurance', offsets: [-45, -14, 1], termMonths: 12, ocr: true },
  { key: 'life_insurance', label: 'ประกันชีวิต', emoji: '📘', tier: 2, group: 'insurance', offsets: [-45, -14, 1], termMonths: 12, ocr: true },
  { key: 'social_security', label: 'ประกันสังคม ม.39/40', emoji: '🧾', tier: 2, group: 'insurance', offsets: [-30, -7, 1], termMonths: 12, ocr: false, singleton: true },
  { key: 'professional_license', label: 'ใบอนุญาตวิชาชีพ', emoji: '📜', tier: 2, group: 'identity', offsets: [-90, -30, -7, 1], ocr: true },
  { key: 'lease', label: 'สัญญาเช่า', emoji: '🏠', tier: 2, group: 'other', offsets: [-60, -30, -7, 1], termMonths: 12, ocr: false },

  // ---------------- tier 3 : ผู้ใช้พิมพ์เองอะไรก็ได้ ----------------
  {
    key: 'custom', label: 'อื่น ๆ', emoji: '🔔', tier: 3, group: 'other',
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

/**
 * ชวนเพิ่มใบต่อไปให้เข้ากับสิ่งที่เพิ่งบันทึก
 * ตัวเลขที่ต้องดันคือ "เอกสารเฉลี่ยต่อคน" — ข้อความที่ไม่เข้าบริบททำให้คนกดน้อยลง
 */
export const SUGGEST_BY_GROUP: Record<DocGroup, { prompt: string; keys: string[] }> = {
  vehicle: {
    prompt: 'มีอีกไหมครับ รถคันเดียวมักมีหลายใบ',
    keys: ['cmi', 'vehicle_tax', 'motor_insurance', 'vehicle_inspection'],
  },
  identity: {
    prompt: 'มีอีกไหมครับ เอกสารประจำตัวมักหมดอายุไล่ ๆ กัน',
    keys: ['national_id', 'driving_license', 'passport', 'visa'],
  },
  insurance: {
    prompt: 'มีกรมธรรม์อื่นอีกไหมครับ',
    keys: ['health_insurance', 'life_insurance', 'motor_insurance', 'social_security'],
  },
  other: {
    prompt: 'มีเอกสารอื่นที่อยากให้ผมจำอีกไหมครับ',
    keys: ['vehicle_tax', 'national_id', 'passport', 'custom'],
  },
};

/** ตัวเลือกที่ให้ผู้ใช้กดตอนเราเดาประเภทไม่ออก */
export const ASK_TYPE_CHOICES = [
  'vehicle_tax', 'cmi', 'motor_insurance', 'driving_license',
  'national_id', 'passport', 'health_insurance', 'custom',
];

/**
 * ชื่อเต็มที่ใช้แสดง เช่น "📄 ภาษีรถ · 1กก 1234"
 *
 * label มีไว้แยกแยะว่าเป็น "ใบไหน" ไม่ใช่พูดซ้ำว่าเอกสารอะไร
 * ถ้า OCR คืนชื่อเอกสารมาเป็น label (เช่น "บัตรประจำตัวประชาชน")
 * ก็ไม่ต้องแสดง เพราะจะกลายเป็น "บัตรประชาชน · บัตรประจำตัวประชาชน"
 */
export function displayName(typeKey: string, label?: string | null): string {
  const t = docType(typeKey);
  if (!label) return `${t.emoji} ${t.label}`;
  const norm = (v: string) => v.replace(/\s|\.|·/g, '').toLowerCase();
  const a = norm(label);
  const b = norm(t.label);
  if (a === b || a.includes(b) || b.includes(a)) return `${t.emoji} ${t.label}`;
  return `${t.emoji} ${t.label} · ${label}`;
}
