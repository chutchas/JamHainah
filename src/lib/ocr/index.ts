import { openAiProvider } from './openai';
import type { OcrProvider } from './types';

let cached: OcrProvider | null = null;

/**
 * จุดเดียวที่เลือก provider — เปลี่ยนเจ้าได้โดยไม่ต้องแตะ webhook
 * (Claude vision / Google Document AI ใส่เพิ่มที่นี่ได้เลย)
 */
export function ocr(): OcrProvider {
  if (!cached) cached = openAiProvider();
  return cached;
}

export * from './types';
