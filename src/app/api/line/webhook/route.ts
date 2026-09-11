import { NextRequest, NextResponse } from 'next/server';
import { verifySignature } from '@/lib/line/signature';
import { handleEvents } from '@/lib/line/handlers';
import { reply } from '@/lib/line/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // OCR ใช้เวลา ~3-8 วิ

export async function POST(req: NextRequest) {
  // ต้องอ่าน raw body — ถ้า parse ก่อนแล้ว stringify กลับ ลายเซ็นจะไม่ตรง
  const raw = await req.text();

  if (!verifySignature(raw, req.headers.get('x-line-signature'))) {
    return new NextResponse('bad signature', { status: 401 });
  }

  let body: { events?: unknown[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse('bad json', { status: 400 });
  }

  const events = (Array.isArray(body.events) ? body.events : []) as Record<string, any>[];
  const started = Date.now();

  /**
   * ส่งทั้งชุดเข้าไปพร้อมกัน ไม่ใช่ไล่ทีละอัน
   * เพราะรูปหลายใบที่ส่งพร้อมกันต้องถูกตอบเป็นข้อความเดียว
   * (quickReply ของ LINE แสดงเฉพาะข้อความสุดท้าย)
   *
   * handleEvents กัน error ของแต่ละ event ไว้เอง แล้วคืนเฉพาะอันที่พังกลับมา
   * จะได้ไม่ยิงข้อความขอโทษให้ event ที่ทำงานสำเร็จไปแล้ว
   */
  const failures = await handleEvents(events);
  console.log(`[webhook] n=${events.length} failed=${failures.length} ms=${Date.now() - started}`);

  for (const { ev, error } of failures) {
    // log ให้อ่านออกใน Vercel — ไม่เอา stack ยาว ๆ ที่หาอะไรไม่เจอ
    console.error(
      `[webhook] FAILED type=${ev?.type} error=${error instanceof Error ? error.message : String(error)}`
    );

    // ผู้ใช้ต้องไม่เจอความเงียบ
    // เงียบแปลว่าเขาไม่รู้ว่าควรลองใหม่ หรือแอปพัง หรือรออยู่
    //
    // ยกเว้นกรณีที่ตัวการ reply เองคือสิ่งที่พัง — reply token ใช้ได้ครั้งเดียว
    // ยิงซ้ำจะได้ "Invalid reply token" เปล่า ๆ แล้วทำให้ log อ่านยากขึ้น
    const replyItselfFailed = error instanceof Error && error.message.includes('/message/reply');
    if (!ev?.replyToken || replyItselfFailed) continue;

    try {
      await reply(ev.replyToken, [
        {
          type: 'text',
          text: 'ขออภัยครับ ระบบมีปัญหาชั่วคราว 🙏\nลองส่งใหม่อีกครั้งได้เลย',
          quickReply: {
            items: [
              { type: 'action', action: { type: 'camera', label: 'ลองใหม่' } },
              { type: 'action', action: { type: 'postback', label: 'คุยกับคน', data: 'a=human', displayText: 'คุยกับคน' } },
            ],
          },
        },
      ]);
    } catch (replyErr) {
      console.error('[webhook] fallback reply failed', replyErr);
    }
  }

  // LINE ต้องได้ 200 เสมอ ไม่งั้นจะ retry แล้วผู้ใช้จะได้ข้อความซ้ำ
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'renewal-reminder webhook' });
}
