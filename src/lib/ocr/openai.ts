import OpenAI from 'openai';
import { env } from '@/lib/env';
import { DOC_TYPES } from '@/lib/domain/docTypes';
import { isISODate, normalizeYear } from '@/lib/domain/thaiDate';
import type { Extraction, OcrProvider } from './types';

const KEYS = DOC_TYPES.map((t) => t.key);

const SYSTEM = `คุณคือระบบอ่านเอกสารราชการและกรมธรรม์ของไทย
หน้าที่เดียวของคุณคือหา "วันหมดอายุ" ของเอกสารในรูป

กฎที่ห้ามพลาด:
1. เอกสารไทยมักมีทั้งวันเริ่มต้นและวันสิ้นสุด — ต้องเอา "วันสิ้นสุด" เท่านั้น
   คำที่บ่งบอกวันสิ้นสุด: สิ้นอายุ, ครบกำหนด, ถึงวันที่, วันสิ้นสุดความคุ้มครอง,
   Expiry, Valid until, สิ้นสุด, ถึง
   คำที่เป็นวันเริ่มต้น (ห้ามเอา): เริ่มต้น, วันที่ออก, ตั้งแต่วันที่, Issue, From,
   เริ่มความคุ้มครอง
2. ปีอาจเป็น พ.ศ. (2569) หรือ ค.ศ. (2026) — ให้แปลงเป็น ค.ศ. เสมอในผลลัพธ์
   ถ้าปี > 2400 ให้ลบ 543
3. ถ้าอ่านไม่ชัด หรือไม่แน่ใจว่าตัวไหนคือวันสิ้นสุด ให้ confidence ต่ำ (< 0.6)
   อย่าเดา — การเดาผิดแย่กว่าการบอกว่าอ่านไม่ออก
4. ถ้ารูปไม่ใช่เอกสาร (เช่น รูปคน สัตว์ วิว อาหาร) ให้ isDocument = false

ประเภทเอกสารที่รู้จัก: ${KEYS.join(', ')}
ถ้าไม่ตรงกับอันไหนเลยให้ docTypeKey = null`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['isDocument', 'docTypeKey', 'label', 'expiryDate', 'confidence', 'notes'],
  properties: {
    isDocument: { type: 'boolean' },
    docTypeKey: { type: ['string', 'null'], enum: [...KEYS, null] },
    label: { type: ['string', 'null'], description: 'เลขทะเบียนรถ เลขกรมธรรม์ หรือเลขเอกสาร' },
    expiryDate: { type: ['string', 'null'], description: 'YYYY-MM-DD เป็น ค.ศ.' },
    confidence: { type: 'number' },
    notes: { type: 'string', description: 'ข้อความบนเอกสารที่ใช้ตัดสินว่าเป็นวันสิ้นสุด' },
  },
} as const;

export function openAiProvider(): OcrProvider {
  return {
    name: 'openai',
    async extract(image: Buffer, mimeType: string): Promise<Extraction> {
      const client = new OpenAI({ apiKey: env.openai.key });
      const dataUrl = `data:${mimeType};base64,${image.toString('base64')}`;

      const res = await client.chat.completions.create({
        model: env.openai.model,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'อ่านเอกสารนี้ แล้วตอบตาม schema' },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
            ],
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'extraction', strict: true, schema: SCHEMA as unknown as Record<string, unknown> },
        },
      });

      const content = res.choices[0]?.message?.content;
      if (!content) return miss();

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(content);
      } catch {
        return miss();
      }

      return normalize(parsed);
    },
  };
}

function miss(): Extraction {
  return { isDocument: true, docTypeKey: null, label: null, expiryDate: null, confidence: 0 };
}

/**
 * โมเดลอาจคืน พ.ศ. มาทั้งที่สั่งให้แปลงแล้ว หรือคืนวันที่ที่ไม่มีจริง
 * ชั้นนี้คือด่านสุดท้ายก่อนข้อมูลเข้าฐาน
 */
export function normalize(parsed: Record<string, unknown>): Extraction {
  const out: Extraction = {
    isDocument: parsed.isDocument !== false,
    docTypeKey: typeof parsed.docTypeKey === 'string' && KEYS.includes(parsed.docTypeKey) ? parsed.docTypeKey : null,
    label: typeof parsed.label === 'string' && parsed.label.trim() ? parsed.label.trim().slice(0, 60) : null,
    expiryDate: null,
    confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
    raw: parsed,
  };

  const rawDate = parsed.expiryDate;
  if (typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    const [y, m, d] = rawDate.split('-');
    const year = normalizeYear(Number(y));
    const candidate = `${String(year).padStart(4, '0')}-${m}-${d}`;
    if (isISODate(candidate)) out.expiryDate = candidate;
  }

  if (!out.expiryDate) out.confidence = Math.min(out.confidence, 0.3);
  return out;
}
