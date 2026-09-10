import { NextRequest, NextResponse } from 'next/server';
import { verifySignature } from '@/lib/line/signature';
import { handleEvent } from '@/lib/line/handlers';

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

  const events = Array.isArray(body.events) ? body.events : [];

  // จัดการทีละ event แต่ไม่ให้ event เดียวพังทั้งชุด
  await Promise.all(
    events.map(async (ev) => {
      try {
        await handleEvent(ev as Record<string, unknown>);
      } catch (err) {
        console.error('[webhook] event failed', err);
      }
    })
  );

  // LINE ต้องได้ 200 เสมอ ไม่งั้นจะ retry แล้วผู้ใช้จะได้ข้อความซ้ำ
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'renewal-reminder webhook' });
}
