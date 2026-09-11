-- ============================================================
-- 0007 — ปุ่มในข้อความเตือน + พื้นที่ของผู้ใช้
-- ============================================================

-- ------------------------------------------------------------
-- renew_actions — ปุ่มที่ติดไปกับข้อความเตือนของเอกสารแต่ละประเภท
--
-- อยู่ในฐานข้อมูลเพราะลิงก์ราชการเน่าแน่นอน
-- และการแก้ลิงก์เสียหนึ่งอันไม่ควรต้อง deploy ใหม่ทั้งระบบ
--
-- v1 แก้ผ่าน Supabase Table Editor ได้เลย ยังไม่ต้องมีหน้า admin
-- ค่อยทำหน้า admin ตอนที่มีคนอื่นนอกจากเราต้องแก้
-- ------------------------------------------------------------
create table if not exists public.renew_actions (
  id          uuid primary key default gen_random_uuid(),
  doc_type    text not null,
  kind        text not null,
  label       text not null,
  url         text,          -- kind = link
  search_term text,          -- kind = location
  sort_order  int  not null default 0,
  enabled     boolean not null default true,
  -- ตรวจลิงก์ครั้งล่าสุดเมื่อไหร่ — ลิงก์ที่ไม่ได้ตรวจนานคือลิงก์ที่น่าสงสัย
  verified_at date,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint renew_actions_kind_check check (kind in ('upsell', 'link', 'location')),
  -- link ต้องมี url · location ต้องมีคำค้น ไม่งั้นปุ่มจะกดแล้วไม่เกิดอะไร
  constraint renew_actions_shape_check check (
    (kind = 'link'     and url is not null) or
    (kind = 'location' and search_term is not null) or
    (kind = 'upsell')
  )
);

create index if not exists renew_actions_lookup_idx
  on public.renew_actions (doc_type, sort_order) where enabled;

drop trigger if exists renew_actions_touch on public.renew_actions;
create trigger renew_actions_touch before update on public.renew_actions
  for each row execute function public.touch_updated_at();

alter table public.renew_actions enable row level security;
revoke all on public.renew_actions from anon, authenticated;
grant all privileges on public.renew_actions to service_role;

-- ค่าตั้งต้น ตรงกับ DEFAULT_RENEW_ACTIONS ใน src/lib/domain/renewActions.ts
insert into public.renew_actions (doc_type, kind, label, url, search_term, sort_order) values
  ('vehicle_tax',        'upsell',   '🛵 ให้เราต่อให้',            null,                            null,                              0),
  ('vehicle_tax',        'link',     '💻 ต่อภาษีออนไลน์',           'https://eservice.dlt.go.th',    null,                              1),
  ('vehicle_tax',        'location', '📍 ตรอ. ใกล้ฉัน',            null,                            'ตรอ. ตรวจสภาพรถ',                  2),
  ('cmi',                'upsell',   '🛵 ให้เราต่อให้',            null,                            null,                              0),
  ('cmi',                'location', '📍 ร้านต่อ พ.ร.บ. ใกล้ฉัน',   null,                            'ต่อ พ.ร.บ. ประกันภัยรถ',            1),
  ('motor_insurance',    'upsell',   '🛵 ให้เราเทียบราคาให้',       null,                            null,                              0),
  ('vehicle_inspection', 'location', '📍 ตรอ. ใกล้ฉัน',            null,                            'ตรอ. ตรวจสภาพรถ',                  0),
  ('driving_license',    'link',     '💻 อบรมออนไลน์ก่อน',          'https://www.dlt.go.th',         null,                              0),
  ('driving_license',    'location', '📍 สำนักงานขนส่งใกล้ฉัน',      null,                            'สำนักงานขนส่งจังหวัด',              1),
  ('national_id',        'location', '📍 ที่ว่าการอำเภอใกล้ฉัน',     null,                            'ที่ว่าการอำเภอ สำนักงานเขต',         0),
  ('passport',           'link',     '💻 จองคิวทำพาสปอร์ต',         'https://consular.mfa.go.th',    null,                              0),
  ('passport',           'location', '📍 สำนักงานหนังสือเดินทาง',    null,                            'สำนักงานหนังสือเดินทาง',            1),
  ('social_security',    'link',     '💻 ประกันสังคมออนไลน์',       'https://www.sso.go.th',         null,                              0),
  ('social_security',    'location', '📍 สนง.ประกันสังคมใกล้ฉัน',    null,                            'สำนักงานประกันสังคม',               1),
  ('visa',               'link',     '💻 ตรวจคนเข้าเมือง',          'https://www.immigration.go.th', null,                              0),
  ('visa',               'location', '📍 สนง.ตม. ใกล้ฉัน',          null,                            'สำนักงานตรวจคนเข้าเมือง',           1),
  ('work_permit',        'location', '📍 สนง.จัดหางานใกล้ฉัน',       null,                            'สำนักงานจัดหางานจังหวัด',           0)
on conflict do nothing;

-- ลิงก์ที่ควรกลับไปตรวจ — ลิงก์ราชการเปลี่ยนบ่อยและพังเงียบ
create or replace view public.v_links_to_check as
select doc_type, label, url, verified_at,
       case when verified_at is null then 'ยังไม่เคยตรวจ'
            else 'ตรวจล่าสุด ' || (current_date - verified_at) || ' วันก่อน' end as status
from public.renew_actions
where enabled and kind = 'link'
  and (verified_at is null or verified_at < current_date - 90)
order by verified_at nulls first;

-- ------------------------------------------------------------
-- พื้นที่ของผู้ใช้ (จากตอนกดขอแผนที่)
--
-- เก็บหยาบโดยตั้งใจ: ปัดพิกัดเหลือทศนิยม 2 ตำแหน่ง (~1 กม.)
-- สิ่งที่ต้องใช้จริงคือ "ผู้ใช้กระจุกอยู่โซนไหน" เพื่อไปหาร้านแถวนั้น
-- มาเป็นพาร์ทเนอร์ ระดับกิโลเมตรพอเหลือเฟือ
-- พิกัดละเอียดคือการเก็บว่าใครอยู่บ้านเลขที่ไหน ซึ่งไม่ได้ช่วยอะไรเพิ่ม
-- แต่เป็นภาระตาม PDPA เต็ม ๆ
-- ------------------------------------------------------------
alter table public.users
  add column if not exists area_label     text,
  add column if not exists area_lat       numeric(6,2),
  add column if not exists area_lng       numeric(6,2),
  add column if not exists area_shared_at timestamptz;

create or replace view public.v_user_areas as
select area_label, area_lat, area_lng, count(*) as users
from public.users
where deleted_at is null and area_lat is not null
group by area_label, area_lat, area_lng
order by users desc;
