import crypto from 'node:crypto';
import { env } from '@/lib/env';

/**
 * LINE เซ็น body ด้วย HMAC-SHA256 + channel secret
 * ต้องเทียบกับ raw body เท่านั้น — ถ้า JSON.parse ก่อนแล้ว stringify กลับ ลายเซ็นจะไม่ตรง
 */
export function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', env.line.secret)
    .update(rawBody)
    .digest('base64');

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
