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
