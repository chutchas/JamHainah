/**
 * รอบเก็บตก 12:30 น.
 *
 * Vercel Hobby ให้ cron วันละครั้งต่อ job และมีได้แค่ 2 job
 * จึงใช้ path แยกแทนการตั้งสองเวลาบน path เดียว
 *
 * รอบนี้เก็บคิวที่เกิดขึ้น "หลังรอบเช้าไปแล้ว" — เช่นเอกสารที่ผู้ใช้เพิ่ม
 * ตอน 9 โมงแล้วถึงกำหนดเตือนวันนั้นพอดี
 *
 * (เคสที่ผู้ใช้เพิ่งบันทึกเองจะถูกตอบไปกับ reply ทันทีอยู่แล้ว รอบนี้เป็นตาข่ายรอง)
 */
import { NextRequest, NextResponse } from 'next/server';
import { runReminders } from '@/lib/reminders/run';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${env.cronSecret}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  return NextResponse.json({ run: 'midday', ...(await runReminders()) });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
