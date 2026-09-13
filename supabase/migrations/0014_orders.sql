-- ============================================================
-- 0014 — คิวงานจริง
--
-- ก่อนหน้านี้ "ให้เราต่อให้" เป็นแค่ event upsell_clicked
-- ซึ่งบอกได้อย่างเดียวว่ามีคนสนใจ เอามาทำงานต่อไม่ได้:
-- ไม่มีสถานะ ไม่มีคนรับผิดชอบ ไม่มีที่จดว่าคุยอะไรไปแล้ว
-- ============================================================

create table if not exists public.orders (
  id           uuid primary key default gen_random_uuid(),
  line_user_id text not null references public.users(line_user_id) on delete cascade,
  -- เอกสารที่เป็นต้นเรื่อง — ลบเอกสารทิ้งแล้วงานยังต้องอยู่ (ลูกค้าจ่ายเงินไปแล้ว)
  document_id  uuid references public.documents(id) on delete set null,
  service      text not null,
  /**
   * สถานะเริ่มจากน้อยที่สุดเท่าที่ยังเล่าเรื่องได้ครบ
   * เพิ่มทีหลังได้เพราะเป็น text + check (แก้ constraint ไม่ต้องย้ายข้อมูล)
   * การเดาสถานะก่อนเคยรับงานจริง มักได้สถานะที่ไม่มีใครใช้ครึ่งหนึ่ง
   */
  status       text not null default 'new',
  assignee     text references public.admins(line_user_id) on delete set null,
  price_thb    numeric(10, 2),
  paid_at      timestamptz,
  note         text,
  /**
   * ข้อมูลที่โบรกเกอร์ต้องการ (ทะเบียน จังหวัด เลขตัวถัง ฯลฯ)
   *
   * อยู่ที่นี่ ไม่ใช่ใน documents โดยตั้งใจ — documents คือของที่เราเก็บยาว
   * เพื่อเตือนไปอีกหลายปี ส่วนก้อนนี้คือของที่ยืมมาใช้ทำงานหนึ่งครั้งแล้วต้องคืน
   * ล้างทิ้งอัตโนมัติหลังงานจบ (purge_after) — เก็บเท่าที่โบรกเกอร์ต้องการ
   * และลบเมื่องานจบ ตามที่ตกลงกันไว้
   */
  vehicle      jsonb not null default '{}'::jsonb,
  purge_after  date,
  purged_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint orders_service_check check (service in ('cmi', 'vehicle_tax', 'motor_insurance', 'other')),
  constraint orders_status_check  check (status in ('new', 'accepted', 'in_progress', 'done', 'cancelled'))
);

-- งานที่ยังไม่จบต้องอยู่บนสุดเสมอ — นี่คือ query เดียวที่เปิดดูทุกวัน
create index if not exists orders_open_idx
  on public.orders (created_at desc) where status in ('new', 'accepted', 'in_progress');
create index if not exists orders_user_idx  on public.orders (line_user_id, created_at desc);
create index if not exists orders_purge_idx on public.orders (purge_after) where purged_at is null;

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- order_events — ไทม์ไลน์ของงานหนึ่งชิ้น
--
-- แยกจาก audit_log เพราะคนละผู้อ่าน:
--   audit_log ตอบว่า "ใครแตะข้อมูลนี้" — ไว้ใช้ตอนมีเรื่อง
--   order_events ตอบว่า "งานนี้เดินมาถึงไหนแล้ว" — ไว้ใช้ตอนทำงาน
-- ยัดรวมกันเมื่อไหร่ จะได้ของที่อ่านยากสำหรับทั้งสองงาน
-- ------------------------------------------------------------
create table if not exists public.order_events (
  id       bigserial primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  actor    text,            -- line_user_id ของผู้ดูแล · null = ระบบทำเอง
  kind     text not null,   -- 'created' · 'status' · 'note' · 'external'
  detail   jsonb not null default '{}'::jsonb,
  at       timestamptz not null default now()
);
create index if not exists order_events_idx on public.order_events (order_id, at desc);

alter table public.orders       enable row level security;
alter table public.order_events enable row level security;
revoke all on public.orders       from anon, authenticated;
revoke all on public.order_events from anon, authenticated;

-- งานที่ยังไม่จบ พร้อมชื่อลูกค้า — หน้าหลังบ้านอ่านจากนี่
create or replace view public.v_open_orders as
select o.id, o.status, o.service, o.created_at, o.price_thb, o.assignee,
       o.line_user_id, u.display_name, d.doc_type, d.expiry_date
from public.orders o
join public.users u on u.line_user_id = o.line_user_id
left join public.documents d on d.id = o.document_id
where o.status in ('new', 'accepted', 'in_progress')
order by o.created_at;
