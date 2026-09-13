-- ============================================================
-- 0013 — ใครเป็นผู้ดูแล และใครทำอะไรไว้
--
-- ทำก่อนขายลูกค้า เพราะสองเรื่องนี้เติมทีหลังแพงที่สุด:
--   สิทธิ์ที่เพิ่มทีหลัง = ต้องรื้อทุก query ที่เคยเชื่อว่ามีคนเดียว
--   ประวัติที่เพิ่มทีหลัง = ช่วงแรกไม่มีประวัติ ซึ่งคือช่วงที่ผิดพลาดบ่อยที่สุด
-- ============================================================

-- ------------------------------------------------------------
-- admins — คนที่เข้าหน้าหลังบ้านได้
--
-- ไม่มี FK ไป users เพราะผู้ดูแลไม่จำเป็นต้องเป็นเพื่อนกับ OA
-- (เข้าหน้าเว็บด้วย LINE Login ก็พอ ไม่ต้อง Add เพื่อน)
--
-- ADMIN_LINE_USER_ID ใน env ยังใช้อยู่ แต่เหลือหน้าที่เดียวคือ bootstrap owner —
-- คนที่เข้าได้เสมอแม้ตารางนี้จะว่างหรือถูกลบหมด กันล็อกตัวเองออกจากระบบ
-- ------------------------------------------------------------
create table if not exists public.admins (
  line_user_id text primary key,
  display_name text,
  -- owner เพิ่ม/ถอดคนได้ · staff ทำงานได้แต่แตะสิทธิ์คนอื่นไม่ได้
  -- มี role ตั้งแต่วันแรกแม้ยังใช้แค่สองค่า เพราะเติม role ตอนมีข้อมูลแล้วเจ็บกว่า
  role         text not null default 'staff',
  added_by     text,
  note         text,
  created_at   timestamptz not null default now(),
  -- ถอดสิทธิ์ = ปิด ไม่ใช่ลบแถว ประวัติว่าใครเคยทำอะไรต้องยังอ่านออก
  disabled_at  timestamptz,
  constraint admins_role_check check (role in ('owner', 'staff'))
);

create index if not exists admins_active_idx on public.admins (line_user_id) where disabled_at is null;

alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

-- ------------------------------------------------------------
-- audit_log — ใครทำอะไร กับอะไร เมื่อไหร่
--
-- เก็บ before/after เป็น jsonb ทั้งก้อน ไม่ใช่แค่ field ที่เปลี่ยน
-- เพราะตอนที่ต้องใช้จริง (ลูกค้าบอกว่า "ไม่ได้สั่งแบบนั้น") เราจะไม่รู้ล่วงหน้า
-- ว่าต้องดู field ไหน และของที่ไม่ได้เก็บไว้ ย้อนไปเก็บไม่ได้
--
-- ไม่มี FK ไป admins เพราะ log ต้องอยู่รอดแม้แถวคนนั้นถูกลบ
-- ------------------------------------------------------------
create table if not exists public.audit_log (
  id      bigserial primary key,
  actor   text not null,              -- line_user_id ของผู้ดูแล
  action  text not null,              -- 'order.status' · 'admin.add' · 'admin.disable'
  entity  text,                       -- 'orders:<uuid>' · 'admins:<line_user_id>'
  before  jsonb,
  after   jsonb,
  at      timestamptz not null default now()
);

create index if not exists audit_entity_idx on public.audit_log (entity, at desc);
create index if not exists audit_actor_idx  on public.audit_log (actor, at desc);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
