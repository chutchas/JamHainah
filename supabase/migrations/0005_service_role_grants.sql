-- ============================================================
-- 0005 — ให้สิทธิ์ service_role อย่างชัดเจน
--
-- อาการที่แก้: "permission denied for table documents"
--
-- service_role ข้าม RLS ได้ก็จริง แต่ยังต้องมี GRANT ระดับตารางอยู่ดี
-- ปกติ Supabase แจกให้อัตโนมัติผ่านตัวเลือก "Automatically expose new tables"
-- แต่โปรเจกต์นี้ปิดตัวเลือกนั้นไว้ (เพื่อไม่ให้ anon เห็นตารางใหม่โดยไม่ตั้งใจ)
-- ตารางที่สร้างจาก migration จึงไม่ได้รับสิทธิ์อะไรเลย
--
-- วิธีนี้ดีกว่าการเปิดตัวเลือกนั้นกลับ เพราะเราให้สิทธิ์ "เฉพาะ service_role"
-- ส่วน anon/authenticated ยังถูกปิดตายเหมือนเดิม
-- ============================================================

grant usage on schema public to service_role;

grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

-- ตารางที่จะสร้างในอนาคตได้สิทธิ์เองโดยไม่ต้องมาแก้ซ้ำ
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;

-- ย้ำอีกครั้งว่า client ภายนอกยังเข้าไม่ได้
revoke all on all tables in schema public from anon, authenticated;
