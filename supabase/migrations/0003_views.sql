-- ============================================================
-- 0003_views.sql — ตัวชี้วัดที่ต้องดูจริง
-- ============================================================

-- ตัวเลขเดียวที่ต้องจ้องใน 90 วันแรก: เอกสารเฉลี่ยต่อคน
-- 1 ใบ = แค่ลองเล่น · 3 ใบขึ้นไป = ย้ายความทรงจำมาไว้ที่เราแล้ว
create or replace view public.v_docs_per_user as
select
  u.line_user_id,
  u.followed_at::date            as joined_on,
  s.name                         as referred_by_shop,
  count(d.id) filter (where d.archived_at is null) as doc_count
from public.users u
left join public.documents d on d.line_user_id = u.line_user_id
left join public.shops s     on s.id = u.referred_by_shop_id
where u.deleted_at is null
group by u.line_user_id, u.followed_at, s.name;

create or replace view public.v_kpi as
select
  count(*)                                                   as users,
  round(avg(doc_count)::numeric, 2)                          as avg_docs_per_user,
  count(*) filter (where doc_count >= 3)                     as users_with_3plus,
  round(100.0 * count(*) filter (where doc_count >= 3)
        / nullif(count(*), 0), 1)                            as pct_3plus,
  count(*) filter (where doc_count = 0)                      as users_with_none
from public.v_docs_per_user;

-- ผลของแต่ละร้าน — ตัวเลขที่เอาไปคุยกับร้าน (ไม่ใช่ใบแจ้งหนี้)
create or replace view public.v_shop_performance as
select
  s.id, s.name,
  count(distinct u.line_user_id)                              as users_referred,
  count(d.id) filter (where d.archived_at is null)            as documents_stored,
  count(distinct u.line_user_id) filter (
    where exists (select 1 from public.documents dd
                  where dd.line_user_id = u.line_user_id and dd.renewed_count > 0)
  )                                                           as users_renewed_at_least_once
from public.shops s
left join public.users u     on u.referred_by_shop_id = s.id and u.deleted_at is null
left join public.documents d on d.line_user_id = u.line_user_id
group by s.id, s.name;
