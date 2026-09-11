/**
 * วันที่ทั้งระบบเป็น 'YYYY-MM-DD' (Postgres date) เสมอ
 * ห้ามใช้ new Date() ตรง ๆ กับ input ผู้ใช้ — timezone จะทำให้เลื่อนไปหนึ่งวัน
 */

const TH_MONTH_ABBR = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];
const TH_MONTH_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export type ISODate = string; // 'YYYY-MM-DD'

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string' || !ISO_RE.test(s)) return false;
  const d = parseISO(s);
  return toISO(d) === s; // ปฏิเสธ 2026-02-31
}

/** แปลงเป็น Date ที่ตรึงไว้ที่ UTC midnight — ปลอดภัยจาก timezone */
export function parseISO(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

/** บวกเดือนแบบ clamp ปลายเดือน (31 ม.ค. + 1 เดือน = 28/29 ก.พ.) */
export function addMonths(iso: ISODate, n: number): ISODate {
  const d = parseISO(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return toISO(d);
}

/** b - a เป็นจำนวนวัน */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);
}

/** วันนี้ตามเวลาไทย — ไม่ขึ้นกับ timezone ของ server (Vercel เป็น UTC) */
export function todayInBangkok(now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return parts; // en-CA ให้ YYYY-MM-DD อยู่แล้ว
}

/** '2026-12-15' -> '15 ธ.ค. 2569'  (พ.ศ. เสมอ — คนไทยอ่าน ค.ศ. บนเอกสารราชการไม่ชิน) */
export function formatThai(iso: ISODate): string {
  const d = parseISO(iso);
  return `${d.getUTCDate()} ${TH_MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`;
}

export function formatThaiLong(iso: ISODate): string {
  const d = parseISO(iso);
  return `${d.getUTCDate()} ${TH_MONTH_FULL[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`;
}

/** "เหลือ 96 วัน" / "ครบกำหนดวันนี้" / "เลยมาแล้ว 3 วัน" */
export function humanRemaining(today: ISODate, expiry: ISODate): string {
  const n = daysBetween(today, expiry);
  if (n === 0) return 'ครบกำหนดวันนี้';
  if (n === 1) return 'เหลือ 1 วัน';
  if (n > 1)  return `เหลือ ${n} วัน`;
  if (n === -1) return 'เลยกำหนดเมื่อวาน';
  return `เลยกำหนดมาแล้ว ${Math.abs(n)} วัน`;
}

/**
 * รับปีจาก OCR ที่อาจเป็น พ.ศ. หรือ ค.ศ. แล้วทำให้เป็น ค.ศ. เสมอ
 * เอกสารไทยเขียน 2569 บ้าง 2026 บ้าง ในเอกสารใบเดียวกันก็มี
 */
export function normalizeYear(year: number): number {
  if (year > 2400) return year - 543;   // พ.ศ.
  return year;                           // ค.ศ.
}

/**
 * ปีสองหลักที่คนไทยพิมพ์ หมายถึงปีอะไร
 *
 * "73" คือ พ.ศ. 2573 = ค.ศ. 2030 ไม่ใช่ ค.ศ. 2073 และไม่ใช่ พ.ศ. 2473
 * ระยะห่าง 543 ปีทำให้เดาถูกได้เกือบเสมอ เพราะมีคำตอบเดียวที่ตกอยู่ใน
 * ช่วงที่เอกสารมีอายุจริง — เอกสารไม่หมดอายุเมื่อ 40 ปีก่อน และไม่หมดอายุอีก 60 ปีข้างหน้า
 *
 * ลองทุกความเป็นไปได้ แล้วเลือกอันที่อยู่ในช่วงที่เป็นไปได้จริง
 */
export function resolveYear(year: number, today: ISODate): number {
  if (year >= 2400) return year - 543;
  if (year >= 1900) return year;

  const now = Number(today.slice(0, 4));
  const candidates = [2500 + year - 543, 2600 + year - 543, 2000 + year];
  const usable = candidates.filter((y) => y >= now - 2 && y <= now + 40);
  // ไม่มีอันไหนเข้าเค้าเลย (เช่นเอกสารที่หมดอายุไปนานแล้ว) เอา พ.ศ. 25xx ไว้ก่อน
  return usable.length ? Math.min(...usable) : 2500 + year - 543;
}

const THAI_MONTHS = [
  ['ม.ค', 'มกรา'], ['ก.พ', 'กุมภา'], ['มี.ค', 'มีนา'], ['เม.ย', 'เมษา'],
  ['พ.ค', 'พฤษภา'], ['มิ.ย', 'มิถุนา'], ['ก.ค', 'กรกฎา'], ['ส.ค', 'สิงหา'],
  ['ก.ย', 'กันยา'], ['ต.ค', 'ตุลา'], ['พ.ย', 'พฤศจิกา'], ['ธ.ค', 'ธันวา'],
];

function buildISO(d: number, m: number, y: number): ISODate | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // กันวันที่ไม่มีจริงอย่าง 31 ก.พ. — Date จะเลื่อนไปเดือนถัดไปเงียบ ๆ
  const back = new Date(`${iso}T00:00:00Z`);
  return back.getUTCDate() === d && back.getUTCMonth() + 1 === m ? (iso as ISODate) : null;
}

/**
 * อ่านวันที่จากข้อความที่ผู้ใช้พิมพ์ — ทำเองก่อนถามโมเดล
 *
 * รูปแบบตัวเลขเป็นสิ่งที่กติกาตายตัวอ่านได้แม่นกว่าและเร็วกว่าโมเดลภาษา
 * และไม่มีวันเปลี่ยนคำตอบเองในวันที่เราไม่ได้แก้อะไร
 * เหลือให้โมเดลทำเฉพาะเรื่องที่กติกาตายตัวทำไม่ได้ เช่น "สิ้นเดือนหน้า"
 *
 * รองรับ: 23/7/73 · 23-07-2573 · 2573-07-23 · 23 ก.ค. 73 · 23 กรกฎาคม 2573
 */
export function parseThaiDateText(text: string, today: ISODate): ISODate | null {
  const t = text.replace(/\u00A0/g, ' ');

  // 2573-07-23 หรือ 2030-07-23
  const iso = t.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    const got = buildISO(Number(iso[3]), Number(iso[2]), resolveYear(Number(iso[1]), today));
    if (got) return got;
  }

  // 23/7/73 · 23-7-2573 · 23.7.73 — คนไทยเขียน วัน/เดือน/ปี เสมอ
  const dmy = t.match(/(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{2,4})/);
  if (dmy) {
    const got = buildISO(Number(dmy[1]), Number(dmy[2]), resolveYear(Number(dmy[3]), today));
    if (got) return got;
  }

  /**
   * 23 ก.ค. 73 · 23 กรกฎาคม 2573
   *
   * ช่วงอักษรต้องเป็น \u0E00-\u0E7F ทั้งบล็อก ไม่ใช่ [ก-ฮ]
   * เพราะสระกับวรรณยุกต์อยู่นอกช่วงพยัญชนะ — "มิ.ย." จะไม่ match ถ้าใช้ [ก-ฮ]
   */
  const thai = t.match(/(\d{1,2})\s*([\u0E00-\u0E7F][\u0E00-\u0E7F.\s]*?)\s*(\d{2,4})/);
  if (thai) {
    const word = thai[2].replace(/\s/g, '');
    const idx = THAI_MONTHS.findIndex(([abbr, full]) => word.startsWith(abbr) || word.startsWith(full));
    if (idx >= 0) {
      const got = buildISO(Number(thai[1]), idx + 1, resolveYear(Number(thai[3]), today));
      if (got) return got;
    }
  }

  return null;
}
