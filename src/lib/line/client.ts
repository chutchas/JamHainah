import { env } from '@/lib/env';
import type { LineMessage } from './messages';

const API = 'https://api.line.me/v2/bot';
const DATA_API = 'https://api-data.line.me/v2/bot';

async function callLine(path: string, body: unknown, base = API): Promise<void> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.line.token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LINE ${path} ${res.status}: ${text}`);
  }
}

/* ============================================================
 * REPLY — ฟรี ไม่กินโควตา
 * ใช้ได้เฉพาะตอบกลับ event ที่ผู้ใช้ทักมา (reply token อายุสั้นมาก)
 *
 * ทุกอย่างที่ผู้ใช้เป็นคนเริ่ม ต้องออกทางนี้: อัปโหลด ยืนยัน กดปุ่ม ดูรายการ
 * ============================================================ */
export async function reply(replyToken: string, messages: LineMessage[]): Promise<void> {
  if (messages.length === 0) return;
  await callLine('/message/reply', { replyToken, messages: messages.slice(0, 5) });
}

/* ============================================================
 * PUSH — ฿0.06 ต่อข้อความ ต่อผู้รับ
 *
 * ⚠️  ห้ามเรียกจากที่อื่นนอกจาก src/app/api/cron/reminders/route.ts
 *     มี test ใน test/no-push-outside-cron.test.ts บังคับกฎนี้ไว้
 *
 *     เหตุผล: ถ้า push หลุดเข้าไปอยู่ใน webhook เมื่อไหร่
 *     ต้นทุนต่อผู้ใช้จะพุ่งโดยไม่มีใครสังเกต จนกว่าจะเห็นบิล
 * ============================================================ */
export async function push(to: string, messages: LineMessage[]): Promise<void> {
  if (messages.length === 0) return;
  await callLine('/message/push', { to, messages: messages.slice(0, 5) });
}

/**
 * แสดงจุดสามจุด "กำลังพิมพ์…" — ไม่นับเป็นข้อความ ไม่เสียเงิน
 * ใช้ตอนรอ OCR แทนการส่งข้อความว่า "กำลังอ่าน..." (ฉาก 02)
 */
export async function showLoading(chatId: string, seconds = 20): Promise<void> {
  try {
    await callLine('/chat/loading/start', {
      chatId,
      loadingSeconds: Math.min(60, Math.max(5, Math.round(seconds / 5) * 5)),
    });
  } catch {
    // ไม่สำคัญพอที่จะทำให้ทั้ง request ล้ม
  }
}

export async function getProfile(userId: string): Promise<{ displayName?: string } | null> {
  try {
    const res = await fetch(`${API}/profile/${userId}`, {
      headers: { Authorization: `Bearer ${env.line.token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as { displayName?: string };
  } catch {
    return null;
  }
}

/** ดึงรูปที่ผู้ใช้ส่งมา — ต้องใช้ api-data host ไม่ใช่ api host */
export async function getMessageContent(messageId: string): Promise<Buffer> {
  const res = await fetch(`${DATA_API}/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${env.line.token}` },
  });
  if (!res.ok) throw new Error(`LINE content ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** ยืนยัน idToken จาก LIFF — ใช้แทนระบบล็อกอินทั้งหมด */
export async function verifyLiffIdToken(idToken: string, channelId: string): Promise<string | null> {
  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { sub?: string };
  return data.sub ?? null;
}
