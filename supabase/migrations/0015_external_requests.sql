-- ============================================================
-- 0015 — กันสั่งซ้ำกับระบบข้างนอก
--
-- ความเสียหายที่ตารางนี้กัน: กดสั่ง พ.ร.บ. แล้วเน็ตหลุดตอนรอคำตอบ
-- เราไม่รู้ว่าโบรกเกอร์รับไปหรือยัง กดใหม่ ลูกค้าได้กรมธรรม์สองใบ
-- จ่ายเงินสองรอบ และเงินที่คืนได้ก็ไม่ได้คืนความเชื่อใจกลับมาด้วย
--
-- ต้องมีก่อนต่อ API เจ้าแรก ไม่ใช่หลังจากเจอปัญหาครั้งแรก
-- เพราะครั้งแรกที่เจอ คือครั้งที่มีลูกค้าจริงเสียหายไปแล้ว
-- ============================================================

create table if not exists public.external_requests (
  id              bigserial primary key,
  provider        text not null,          -- ชื่อโบรกเกอร์/ระบบปลายทาง
  /**
   * กุญแจที่เราสร้างเอง ไม่ใช่ของที่ปลายทางให้มา
   * ประกอบจากสิ่งที่ทำให้ "คำสั่งเดียวกัน" ได้กุญแจเดียวกันเสมอ
   * เช่น orders:<id>:buy — ยิงซ้ำกี่ครั้งก็ชนแถวเดิม แล้วเราอ่านคำตอบเก่าได้เลย
   */
  idempotency_key text not null,
  order_id        uuid references public.orders(id) on delete set null,
  request         jsonb not null default '{}'::jsonb,
  -- เก็บคำตอบดิบไว้ทั้งก้อน ตอนทะเลาะกันว่าใครส่งอะไร เราต้องมีของจริงให้ดู
  response        jsonb,
  status          text not null default 'pending',
  error           text,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz,
  constraint external_status_check check (status in ('pending', 'ok', 'failed')),
  constraint external_key_unique unique (provider, idempotency_key)
);

create index if not exists external_order_idx on public.external_requests (order_id, created_at desc);
-- คำขอที่ค้าง pending นานผิดปกติ = ต้องมีคนไปตามกับปลายทาง
create index if not exists external_stuck_idx on public.external_requests (created_at)
  where status = 'pending';

alter table public.external_requests enable row level security;
revoke all on public.external_requests from anon, authenticated;
