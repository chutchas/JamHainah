-- ============================================================
-- 0001_core.sql — โครงหลัก
-- users / shops / documents / reminder_queue / events
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- shops — ร้านพาร์ทเนอร์ (ตรอ. / ร้านต่อภาษี / โบรกเกอร์)
-- ใช้ทั้งวัด referral ขา A และ route งานขา B
-- ------------------------------------------------------------
create table if not exists public.shops (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  phone        text,
  address      text,
  map_url      text,
  lat          double precision,
  lng          double precision,
  is_partner   boolean not null default true,
  joined_on    date not null default current_date,
  note         text,
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- users — 1 แถวต่อ 1 LINE user ของ OA นี้
-- ไม่มีระบบสมาชิก ไม่มีรหัสผ่าน — line_user_id คือ identity
-- ------------------------------------------------------------
create table if not exists public.users (
  line_user_id        text primary key,
  display_name        text,
  plan                text not null default 'free',      -- free | paid
  paid_until          date,
  referred_by_shop_id uuid references public.shops(id) on delete set null,
  followed_at         timestamptz not null default now(),
  unfollowed_at       timestamptz,                       -- ถูกบล็อก/ลบเพื่อน
  deleted_at          timestamptz,                       -- PDPA: ผู้ใช้สั่งลบ
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint users_plan_check check (plan in ('free','paid'))
);

-- ------------------------------------------------------------
-- documents — เอกสารที่ผู้ใช้ฝากให้จำ
-- doc_type อ้างอิง registry ใน src/lib/domain/docTypes.ts
-- confirmed_by_user = ผู้ใช้กด "ถูกต้อง" แล้ว (ฉาก 02)
-- ------------------------------------------------------------
create table if not exists public.documents (
  id                 uuid primary key default gen_random_uuid(),
  line_user_id       text not null references public.users(line_user_id) on delete cascade,
  doc_type           text not null,
  label              text,                                -- "1กก 1234", "เล่มแดง"
  expiry_date        date not null,
  confirmed_by_user  boolean not null default false,
  source             text not null default 'ocr',         -- ocr | manual | rollover
  image_path         text,                                -- storage key; ล้างทิ้งตาม image_purge_after
  image_purge_after  date,
  meta               jsonb not null default '{}'::jsonb,  -- {plate, insurer, ocr_confidence, ...}
  renewed_count      int not null default 0,              -- นับรอบที่กด "ต่อแล้ว"
  archived_at        timestamptz,                         -- "ไม่ได้ใช้รถคันนี้แล้ว"
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint documents_source_check check (source in ('ocr','manual','rollover'))
);

create index if not exists documents_user_active_idx
  on public.documents (line_user_id) where archived_at is null;
create index if not exists documents_expiry_idx
  on public.documents (expiry_date) where archived_at is null;
create index if not exists documents_purge_idx
  on public.documents (image_purge_after) where image_path is not null;

-- ------------------------------------------------------------
-- reminder_queue — คิวการเตือน คำนวณล่วงหน้าตอนบันทึกเอกสาร
--
-- เหตุผลที่แยกเป็นตารางต่างหาก: cron ตอนเช้าแค่ SELECT ตามวันที่
-- ไม่ต้องไล่คำนวณจาก documents ทุกเช้า และ group ตาม user ได้ตรง ๆ
-- (กฎข้อ 4 — รวมเป็นข้อความเดียวเสมอ)
-- ------------------------------------------------------------
create table if not exists public.reminder_queue (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents(id) on delete cascade,
  line_user_id  text not null references public.users(line_user_id) on delete cascade,
  send_on       date not null,
  offset_days   int  not null,                            -- -90 -30 -7 = ก่อน, 1 = หลังครบกำหนด
  kind          text not null,                            -- upcoming | due
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'pending',          -- pending | sent | skipped | failed
  sent_at       timestamptz,
  error         text,
  created_at    timestamptz not null default now(),
  constraint reminder_kind_check   check (kind   in ('upcoming','due')),
  constraint reminder_status_check check (status in ('pending','sent','skipped','failed'))
);

-- ดัชนีหลักที่ cron ใช้ทุกเช้า
create index if not exists reminder_queue_due_idx
  on public.reminder_queue (send_on) where status = 'pending';
create index if not exists reminder_queue_user_idx
  on public.reminder_queue (line_user_id, send_on);
-- กันคิวซ้ำของเอกสารใบเดียวกันที่ offset เดียวกัน
create unique index if not exists reminder_queue_unique_pending
  on public.reminder_queue (document_id, offset_days) where status = 'pending';

-- ------------------------------------------------------------
-- events — ตัววัดทั้งหมดอยู่ที่นี่
-- ตัวเลขที่ต้องจ้องใน 90 วันแรก: เอกสารเฉลี่ยต่อคน (ดู v_kpi)
-- ------------------------------------------------------------
create table if not exists public.events (
  id           bigserial primary key,
  line_user_id text,
  name         text not null,
  props        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists events_name_idx on public.events (name, created_at desc);
create index if not exists events_user_idx on public.events (line_user_id, created_at desc);

-- ------------------------------------------------------------
-- updated_at trigger
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists users_touch on public.users;
create trigger users_touch before update on public.users
  for each row execute function public.touch_updated_at();

drop trigger if exists documents_touch on public.documents;
create trigger documents_touch before update on public.documents
  for each row execute function public.touch_updated_at();
