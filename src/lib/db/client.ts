import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

let cached: SupabaseClient | null = null;

/**
 * service role — bypass RLS
 * ห้ามส่ง client ตัวนี้ไปฝั่ง browser เด็ดขาด (ทุกไฟล์ที่ import ต้องเป็น server-only)
 */
export function db(): SupabaseClient {
  if (!cached) {
    cached = createClient(env.supabase.url, env.supabase.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
