/**
 * อ่านข้อความที่ผู้ใช้พิมพ์มาเอง — "พ.ร.บ. หมดอายุ 30 มิ.ย. 69"
 *
 * ทำไมต้องมี: การพิมพ์เองเคยเป็นทางยาวที่สุดในระบบ
 *   กดปุ่ม → เลือกประเภท → เปิดปฏิทิน → เลื่อนหาปี → กดยืนยัน
 * ห้าจังหวะ เพื่อบอกเรื่องที่พูดจบในประโยคเดียว
 *
 * คนที่ไม่มีเอกสารอยู่ในมือตอนนั้น (อยู่บนรถ อยู่ในที่ประชุม) คือคนที่
 * อยากบันทึกไว้ก่อนแล้วลืมน้อยที่สุด เขาไม่ควรเป็นคนที่เราทำให้ลำบากที่สุด
 *
 * ใช้โมเดลตัวเล็กเพราะงานนี้ง่ายกว่าอ่านรูปมาก และถูกกว่าราว 20 เท่า
 */
import OpenAI from 'openai';
import { env } from '@/lib/env';
import { DOC_TYPES } from '@/lib/domain/docTypes';
import { formatThaiLong, parseThaiDateText } from '@/lib/domain/thaiDate';
import type { ISODate } from '@/lib/domain/thaiDate';
import type { Extraction } from './types';
import { normalize } from './openai';

const TEXT_KEYS = DOC_TYPES.filter((t) => t.tier !== 3).map((t) => t.key);

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isDocument', 'docTypeKey', 'label', 'expiryDate', 'confidence', 'notes'],
  properties: {
    isDocument: {
      type: 'boolean',
      description: 'ข้อความนี้กำลังบอกเรื่องเอกสารที่มีวันหมดอายุหรือเปล่า ทักทาย/ถามทั่วไป = false',
    },
    docTypeKey: { type: ['string', 'null'], enum: [...TEXT_KEYS, null] },
    label: {
      type: ['string', 'null'],
      description: 'เลขทะเบียนรถหรือเลขกรมธรรม์ถ้าเขาบอกมา เช่น "1กก 1234" ไม่มีก็ null',
    },
    expiryDate: { type: ['string', 'null'], description: 'YYYY-MM-DD เป็น ค.ศ.' },
    confidence: { type: 'number' },
    notes: { type: 'string', description: 'ส่วนของข้อความที่ใช้ตัดสิน' },
  },
} as const;

function system(today: ISODate): string {
  return `คุณคือระบบอ่านข้อความภาษาไทยที่ผู้ใช้พิมพ์บอกวันหมดอายุเอกสาร
วันนี้คือ ${formatThaiLong(today)} (${today})

กฎ:
1. ปีสองหลักในบริบทไทยคือ พ.ศ. — "69" หมายถึง 2569 = ค.ศ. 2026
   ปีที่มากกว่า 2400 ให้ลบ 543 ผลลัพธ์เป็น ค.ศ. เสมอ
2. วันแบบพูด ("สิ้นเดือนนี้", "ปีหน้า", "อีก 3 เดือน") ให้คำนวณจากวันนี้
   "สิ้นเดือน" = วันสุดท้ายของเดือนนั้น
3. ปีสองหลักคือ พ.ศ. เสมอ — "73" = พ.ศ. 2573 = ค.ศ. 2030
   ไม่ใช่ ค.ศ. 2073 และไม่ใช่ พ.ศ. 2473
4. รูปแบบตัวเลขเป็น วัน/เดือน/ปี เสมอ — "23/7/73" = 23 กรกฎาคม พ.ศ. 2573
5. บอกแค่เดือนกับปี ไม่บอกวัน ให้ใช้วันสุดท้ายของเดือน
   เพราะเอกสารหมดอายุสิ้นเดือนบ่อยกว่าต้นเดือน และเตือนเร็วไปดีกว่าเตือนช้าไป
6. ไม่มีวันที่ในข้อความเลย ให้ expiryDate = null — ห้ามเดา
   ระบบจะไปถามผู้ใช้เอง ซึ่งดีกว่าเดาผิดแล้วเขาเสียค่าปรับ
7. ข้อความที่ไม่ได้พูดถึงเอกสาร (ทักทาย ถามราคา บ่น) ให้ isDocument = false
8. ไม่ตรงกับประเภทที่รู้จัก ให้ docTypeKey = null ห้ามเดาให้ใกล้เคียง

ประเภทที่รู้จัก: ${TEXT_KEYS.join(', ')}`;
}

export async function extractFromText(text: string, today: ISODate): Promise<Extraction> {
  const client = new OpenAI({ apiKey: env.openai.key });
  const res = await client.chat.completions.create({
    model: env.openai.textModel,
    temperature: 0,
    messages: [
      { role: 'system', content: system(today) },
      { role: 'user', content: text.slice(0, 500) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'extraction', strict: true, schema: SCHEMA as unknown as Record<string, unknown> },
    },
  });

  const content = res.choices[0]?.message?.content;
  if (!content) return { isDocument: false, docTypeKey: null, label: null, expiryDate: null, confidence: 0 };

  try {
    // normalize ตัวเดียวกับฝั่งรูป — ด่านสุดท้ายก่อนข้อมูลเข้าฐานต้องมีที่เดียว
    const out = normalize(JSON.parse(content));

    /**
     * กติกาตายตัวชนะโมเดลเสมอถ้ามันอ่านออก
     *
     * "23/7/73" มีคำตอบเดียว ไม่ต้องใช้ความเข้าใจภาษาอะไรเลย
     * ส่วนโมเดลเคยตอบว่าไม่เจอวันที่ในข้อความนี้ และเคยตีเป็น ค.ศ. 2073
     * เหลือให้มันทำเฉพาะเรื่องที่กติกาตายตัวทำไม่ได้ เช่น "สิ้นเดือนหน้า"
     */
    const exact = parseThaiDateText(text, today);
    if (exact) {
      out.expiryDate = exact;
      out.isDocument = true;
      out.confidence = Math.max(out.confidence, 0.9);
    }
    return out;
  } catch {
    return { isDocument: false, docTypeKey: null, label: null, expiryDate: null, confidence: 0 };
  }
}
