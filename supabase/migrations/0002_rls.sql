-- ============================================================
-- 0002_rls.sql
-- ทุก access ผ่าน server (service role) เท่านั้น
-- เปิด RLS แล้วไม่ใส่ policy = ไม่มี client ตัวไหนอ่านได้เลย
-- LIFF ไม่ได้คุย Supabase ตรง ๆ — คุยผ่าน /api/liff/* ที่ verify LINE idToken ก่อน
-- ============================================================

alter table public.users          enable row level security;
alter table public.shops          enable row level security;
alter table public.documents      enable row level security;
alter table public.reminder_queue enable row level security;
alter table public.events         enable row level security;

-- ตัดสิทธิ์ anon/authenticated ทิ้งให้หมด (service role bypass RLS อยู่แล้ว)
revoke all on public.users          from anon, authenticated;
revoke all on public.shops          from anon, authenticated;
revoke all on public.documents      from anon, authenticated;
revoke all on public.reminder_queue from anon, authenticated;
revoke all on public.events         from anon, authenticated;
