-- ============================================================
-- 0011 — อนุญาต source = 'text'
--
-- บั๊กที่ทำให้ "พิมพ์วันหมดอายุมาเอง" พังทุกครั้งตั้งแต่วันแรกที่มี feature นี้
--
-- constraint ใน 0001 เขียนไว้ตอนที่ระบบรับแต่รูป: source in ('ocr','manual','rollover')
-- ต่อมาเพิ่มทางเข้าใหม่ (พิมพ์ข้อความ) ซึ่งส่ง source = 'text' เข้ามา
-- insert จึงถูกปฏิเสธ แล้ว webhook ตอบว่า "ระบบมีปัญหาชั่วคราว" —
-- ผู้ใช้เห็นเป็น "AI อ่านภาษาไทยไม่ออก" ซึ่งไม่ใช่เรื่องจริงเลย
--
-- บทเรียน: ค่าที่โค้ดส่งได้ ต้องอยู่ใน constraint ให้ครบ
-- มี test บังคับไว้แล้วใน test/document-source.test.ts
-- ============================================================
alter table public.documents drop constraint if exists documents_source_check;

alter table public.documents add constraint documents_source_check
  check (source in ('ocr', 'text', 'manual', 'rollover'));
