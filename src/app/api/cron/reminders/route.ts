import { NextRequest, NextResponse } from 'next/server';
import { runReminders } from '@/lib/reminders/run';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${env.cronSecret}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  return NextResponse.json(await runReminders());
}

export async function POST(req: NextRequest) {
  return GET(req);
}
