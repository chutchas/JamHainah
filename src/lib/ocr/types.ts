export interface Extraction {
  /** รูปนี้เป็นเอกสารที่มีวันหมดอายุหรือเปล่า (รูปแมวก็จะเข้ามาทางนี้) */
  isDocument: boolean;
  /** key จาก DOC_TYPES — null ถ้าเดาไม่ออก แล้วจะไปถามผู้ใช้ */
  docTypeKey: string | null;
  /** เลขทะเบียนรถ / เลขกรมธรรม์ / เลขเอกสาร */
  label: string | null;
  /** 'YYYY-MM-DD' เป็น ค.ศ. เสมอ (แปลง พ.ศ. มาแล้ว) */
  expiryDate: string | null;
  /** 0..1 — ต่ำกว่า CONFIDENCE_FLOOR จะไปฉาก 02b แทนที่จะเดา */
  confidence: number;
  /** ไว้ดูตอน debug ว่าโมเดลเห็นอะไร */
  raw?: unknown;
}

export interface OcrProvider {
  name: string;
  extract(image: Buffer, mimeType: string): Promise<Extraction>;
}

/**
 * ต่ำกว่านี้ = ไม่เดา ไปถามผู้ใช้ตรง ๆ (ฉาก 02b)
 *
 * ระบบที่ทำหน้าที่ "จำแทน" ผิดพลาดไม่ได้ เพราะผู้ใช้เลิกจำเองแล้ว
 * การเดาผิดแล้วเตือนช้า ทำให้เขาเสียค่าปรับ แล้วเขาจะโทษเรา
 */
export const CONFIDENCE_FLOOR = 0.6;
