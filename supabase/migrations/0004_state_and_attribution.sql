-- ============================================================
-- 0004 — สถานะบทสนทนา + การอ้างอิงร้าน
-- ============================================================

-- สถานะระหว่างทางของบทสนทนา เช่น "กดเลือก พ.ร.บ. แล้ว รอรูป"
-- เก็บบน users เพราะ 1 ผู้ใช้มีบทสนทนาเดียว ไม่ต้องมีตาราง session
alter table public.users
  add column if not exists pending jsonb not null default '{}'::jsonb;

-- ------------------------------------------------------------
-- shop_scans — คนสแกน QR ที่เคาน์เตอร์ร้าน (ยังไม่ได้ Add เพื่อน)
--
-- ทำไมต้องมีตารางนี้: follow event ของ LINE ไม่บอกว่ามาจากไหน
-- ทางที่ได้ผลจริงคือ QR ชี้ไป LIFF (ซึ่งรู้ line_user_id โดยไม่ต้อง follow)
-- บันทึกไว้ก่อน แล้วตอน follow ค่อยจับคู่ย้อนหลัง
-- ------------------------------------------------------------
create table if not exists public.shop_scans (
  id           bigserial primary key,
  line_user_id text not null,
  shop_id      uuid not null references public.shops(id) on delete cascade,
  scanned_at   timestamptz not null default now()
);
create index if not exists shop_scans_user_idx on public.shop_scans (line_user_id, scanned_at desc);

alter table public.shop_scans enable row level security;
revoke all on public.shop_scans from anon, authenticated;

-- code สั้น ๆ ที่พิมพ์บนป้าย standee (เช่น somchai01)
alter table public.shops
  add column if not exists code text unique;
