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
  /**
   * ชื่อสั้นสำหรับป้ายปุ่มที่มีคำนำหน้า เช่น "แก้ ตรอ."
   *
   * quick reply ของ LINE รับป้ายยาวได้ 20 ตัวอักษร เกินแล้วมันตอบ 400 ทั้งก้อน
   * ใส่เฉพาะประเภทที่ชื่อเต็มยาวจนไม่เหลือที่ให้คำว่า "ถูกต้อง"/"แก้"
   */
  shortLabel?: string;
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
    key: 'vehicle_inspection', label: 'ตรวจสภาพรถ (ตรอ.)', emoji: '🔧', tier: 1, group: 'vehicle', shortLabel: 'ตรวจสภาพรถ',
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
  { key: 'work_permit', label: 'ใบอนุญาตทำงาน', emoji: '💼', tier: 2, group: 'identity', shortLabel: 'ใบทำงาน', offsets: [-60, -30, -7, 1], termMonths: 12, ocr: true },
  { key: 'health_insurance', label: 'ประกันสุขภาพ', emoji: '🏥', tier: 2, group: 'insurance', offsets: [-45, -14, 1], termMonths: 12, ocr: true },
  { key: 'life_insurance', label: 'ประกันชีวิต', emoji: '📘', tier: 2, group: 'insurance', offsets: [-45, -14, 1], termMonths: 12, ocr: true },
  { key: 'social_security', label: 'ประกันสังคม ม.39/40', emoji: '🧾', tier: 2, group: 'insurance', shortLabel: 'ประกันสังคม', offsets: [-30, -7, 1], termMonths: 12, ocr: false, singleton: true },
  { key: 'professional_license', label: 'ใบอนุญาตวิชาชีพ', emoji: '📜', tier: 2, group: 'identity', shortLabel: 'ใบวิชาชีพ', offsets: [-90, -30, -7, 1], ocr: true },
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
    prompt: 'รถคันนี้มีใบอื่นอีกไหมครับ',
    keys: ['cmi', 'vehicle_tax', 'motor_insurance', 'vehicle_inspection'],
  },
  identity: {
    prompt: 'มีเอกสารที่หมดอายุไล่ ๆ กันไหมครับ',
    keys: ['national_id', 'driving_license', 'passport', 'visa'],
  },
  insurance: {
    prompt: 'มีกรมธรรม์อื่นอีกไหมครับ',
    keys: ['health_insurance', 'life_insurance', 'motor_insurance', 'social_security'],
  },
  other: {
    prompt: 'มีเอกสารอื่นอีกไหมครับ',
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
/**
 * ชื่อเอกสารแบบไม่มี emoji — ใช้ในการ์ด Flex ที่มีไอคอนรูปของเราอยู่แล้ว
 * ใส่ทั้งคู่จะได้สัญลักษณ์สองอันบอกเรื่องเดียวกัน ซึ่งไม่ได้ช่วยอะไรนอกจากรก
 */
export function plainName(typeKey: string, label?: string | null): string {
  return displayName(typeKey, label).replace(/^\S+\s/u, '');
}

export function displayName(typeKey: string, label?: string | null): string {
  const t = docType(typeKey);
  if (!label) return `${t.emoji} ${t.label}`;
  const norm = (v: string) => v.replace(/\s|\.|·/g, '').toLowerCase();
  const a = norm(label);
  const b = norm(t.label);
  if (a === b || a.includes(b) || b.includes(a)) return `${t.emoji} ${t.label}`;
  return `${t.emoji} ${t.label} · ${label}`;
}

/* ============================================================
 * จับประเภทเอกสารจากคำที่ผู้ใช้พิมพ์ — โดยไม่ต้องถามโมเดล
 *
 * ทำไมต้องมีทั้งที่มี AI อยู่แล้ว:
 *   1. "วีซ่า 12/10/2570" มีคำตอบเดียว ไม่ต้องใช้ความเข้าใจภาษาอะไรเลย
 *      เรียกโมเดลเพื่อเรื่องนี้คือจ่ายเงินและให้ผู้ใช้รอ 2 วินาทีเปล่า ๆ
 *   2. วันที่โมเดลล่ม/คีย์หมดอายุ/โควตาเต็ม ระบบต้องยังรับเอกสารได้
 *      ทางเข้าที่พังทั้งเส้นเพราะของข้างนอกเจ๊ง คือทางเข้าที่ไม่น่าเชื่อถือ
 *
 * ทนคำพิมพ์ผิดด้วย เพราะคนพิมพ์จากมือถือ:
 *   "พาสพอต" "พาสปอต" "วีซา" "พรบ" — ทั้งหมดต้องเข้าใจ
 *   วิธี: ตัดวรรณยุกต์/ทัณฑฆาตออก ยุบอักษรซ้ำ แล้วเทียบระยะแก้ไข (Levenshtein)
 *   ไม่ใช้ตารางคำผิดล้วน ๆ เพราะคำผิดมีมากกว่าที่เราจะนึกออกเสมอ
 * ============================================================ */

/** คำที่คนพิมพ์จริง — ไม่ต้องใส่ทุกคำผิด ตัวเทียบระยะแก้ไขรับที่เหลือ */
const ALIASES: Record<string, string[]> = {
  vehicle_tax: ['ภาษีรถ', 'ภาษีรถยนต์', 'ป้ายภาษี', 'ต่อภาษี', 'ภาษีมอเตอร์ไซค์', 'tax'],
  cmi: ['พ.ร.บ.', 'พรบ', 'พรบรถ', 'ประกันภัยภาคบังคับ'],
  motor_insurance: ['ประกันรถ', 'ประกันรถยนต์', 'ประกันชั้น1', 'ประกันภัยรถ', 'ประกันภาคสมัครใจ'],
  vehicle_inspection: ['ตรวจสภาพรถ', 'ตรวจสภาพ', 'ตรอ'],
  driving_license: ['ใบขับขี่', 'ใบอนุญาตขับขี่', 'ใบขับ', 'driverlicense', 'drivinglicense'],
  national_id: ['บัตรประชาชน', 'บัตรปชช', 'บัตรประจำตัวประชาชน', 'บัตรประจำตัว'],
  // "พาสพอต" ไม่ได้ต่างจาก "พาสปอร์ต" แค่วรรณยุกต์ — สะกดพยัญชนะต่างกันด้วย
  // ระยะแก้ไขที่กว้างพอจะรับคำนี้ กว้างพอจะทำให้ "ประกันสังคม" กลายเป็น
  // "ประกันสุขภาพ" ไปด้วย จึงใส่คำที่คนพิมพ์บ่อยลงตารางตรง ๆ แทนการขยายเพดาน
  passport: ['พาสปอร์ต', 'พาสสปอร์ต', 'พาสพอร์ต', 'พาสพอต', 'พาสปอต', 'หนังสือเดินทาง', 'passport'],
  visa: ['วีซ่า', 'visa'],
  work_permit: ['ใบอนุญาตทำงาน', 'เวิร์คเพอร์มิท', 'workpermit'],
  health_insurance: ['ประกันสุขภาพ', 'ประกันโรค'],
  life_insurance: ['ประกันชีวิต'],
  social_security: ['ประกันสังคม', 'มาตรา39', 'มาตรา40', 'ม39', 'ม40'],
  professional_license: ['ใบอนุญาตวิชาชีพ', 'ใบประกอบวิชาชีพ', 'ใบอนุญาตประกอบวิชาชีพ'],
  lease: ['สัญญาเช่า', 'สัญญาเช่าบ้าน', 'สัญญาเช่าห้อง'],
};

/**
 * ทำให้คำสองคำที่ "ออกเสียงเหมือนกันแต่พิมพ์ไม่เหมือน" หน้าตาเท่ากัน
 *
 * U+0E47–U+0E4E คือวรรณยุกต์ ไม้ไต่คู้ ทัณฑฆาต นิคหิต —
 * ส่วนที่คนพิมพ์มือถือใส่ผิดหรือลืมใส่บ่อยที่สุด และไม่เปลี่ยนความหมายของคำ
 * ("พาสปอร์ต" กับ "พาสปอรต" คือคำเดียวกันในสายตาคนอ่าน)
 */
function squash(s: string): string {
  return s
    .toLowerCase()
    .replace(/[็-๎]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .replace(/(.)\1+/gu, '$1');
}

/** ระยะแก้ไข — จำนวนครั้งที่ต้องเพิ่ม/ลบ/เปลี่ยนตัวอักษรเพื่อให้สองคำเท่ากัน */
function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * ยอมให้พิมพ์ผิดได้กี่ตัว — ประมาณ 1 ใน 4 ของความยาวคำ
 * คำสั้น (ตรอ, ม39) ต้องตรงเป๊ะ เพราะยอมให้ผิดตัวเดียวก็ชนคำอื่นได้ง่าย
 */
function tolerance(len: number): number {
  if (len <= 3) return 0;
  return Math.max(1, Math.floor(len / 4));
}

/**
 * คืน key ของประเภทเอกสารที่คำในข้อความชี้ถึง หรือ null ถ้าไม่ชัด
 * คำที่ยาวกว่าชนะ — "ประกันสุขภาพ" ต้องไม่ถูก "ประกันรถ" แย่งไป
 */
export function matchDocType(text: string): string | null {
  const hay = squash(text);
  if (!hay) return null;

  let best: { key: string; len: number; dist: number } | null = null;

  for (const [key, words] of Object.entries(ALIASES)) {
    for (const word of words) {
      const w = squash(word);
      if (!w) continue;
      const tol = tolerance(w.length);

      let dist = hay.includes(w) ? 0 : Infinity;
      if (dist > 0 && tol > 0) {
        // เลื่อนหน้าต่างหาช่วงที่ใกล้คำนี้ที่สุด เพราะภาษาไทยไม่เว้นวรรค
        // ("พาสพอตหมดอายุ" ไม่มีขอบคำให้ตัด ต้องลองทุกตำแหน่ง)
        for (let i = 0; i + w.length - tol <= hay.length; i++) {
          for (let l = Math.max(1, w.length - tol); l <= w.length + tol; l++) {
            if (i + l > hay.length) break;
            dist = Math.min(dist, distance(w, hay.slice(i, i + l)));
            if (dist === 0) break;
          }
          if (dist === 0) break;
        }
      }

      if (dist > tol) continue;
      // ยาวกว่าชนะก่อน ถ้ายาวเท่ากันเอาอันที่เพี้ยนน้อยกว่า
      if (!best || w.length > best.len || (w.length === best.len && dist < best.dist)) {
        best = { key, len: w.length, dist };
      }
    }
  }

  return best?.key ?? null;
}
