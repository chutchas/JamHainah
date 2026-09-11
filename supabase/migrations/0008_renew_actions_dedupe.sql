-- ============================================================
-- 0008 — ปุ่มต่ออายุขึ้นซ้ำสองแถว
-- ============================================================
--
-- สาเหตุ: 0007 ใช้ "on conflict do nothing" ทั้งที่ยังไม่มี unique constraint
-- ให้ยึดอะไร คำสั่งนั้นจึงไม่ได้กันอะไรเลย รันซ้ำเมื่อไหร่ก็ได้แถวซ้ำเมื่อนั้น
--
-- แก้สองชั้น: ล้างของซ้ำที่มีอยู่ แล้วใส่ unique index ไว้กันรอบหน้า
-- ------------------------------------------------------------

-- เก็บแถวที่เก่าที่สุดของแต่ละ (ประเภทเอกสาร, ปุ่ม) — แถวที่เหลือคือของที่รันซ้ำมา
delete from public.renew_actions a
using public.renew_actions b
where a.doc_type = b.doc_type
  and a.label = b.label
  and (a.created_at, a.id) > (b.created_at, b.id);

create unique index if not exists renew_actions_unique_label
  on public.renew_actions (doc_type, label);
