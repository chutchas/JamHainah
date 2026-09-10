# จำให้นะ

ความจำสำรองสำหรับทุกอย่างที่มีวันหมดอายุ — LINE OA ที่จำวันหมดอายุเอกสารให้ผู้ใช้
แล้วเตือนก่อนถึงกำหนด (ภาษีรถ · พ.ร.บ. · ใบขับขี่ · ประกัน · พาสปอร์ต · อื่น ๆ)

## หลักการที่โค้ดทั้งชุดยึดไว้

**1. Reply ฟรี · Push เสียเงิน — แยกให้ขาด**
`reply()` ใช้ตอบทุกอย่างที่ผู้ใช้เป็นคนเริ่ม (ฟรี ไม่กินโควตา)
`push()` เสีย ฿0.06 ต่อข้อความ และ **มีที่เดียวที่เรียกได้** คือ `src/lib/reminders/run.ts`
มี test บังคับกฎนี้: `test/no-push-outside-cron.test.ts`

**2. รวมเป็นข้อความเดียวเสมอ**
เอกสาร 3 ใบครบกำหนดวันเดียวกัน = ส่ง 1 ครั้ง ไม่ใช่ 3 ครั้ง
บังคับใน cron ด้วยการ group ตาม `line_user_id` ก่อนส่ง — ประหยัดครึ่งหนึ่งของค่าข้อความทั้งระบบ

**3. ห้ามเดาวันที่**
OCR ที่ confidence < 0.6 หรืออ่านวันที่ไม่ได้ จะไม่บันทึกอะไรเลย แต่ไปถามผู้ใช้ตรง ๆ
และผู้ใช้ต้องกด "ถูกต้อง" ก่อน เอกสารถึงจะเข้าคิวเตือน
ระบบที่ทำหน้าที่จำแทนผิดพลาดไม่ได้ เพราะผู้ใช้เลิกจำเองแล้ว

**4. เอกสารต้องต่ออายุตัวเองได้**
ทุกประเภทมีการเตือนหลังครบกำหนด (D+1) พร้อมปุ่ม "ต่อแล้ว" ที่เลื่อนวันไปอีกรอบอัตโนมัติ
ถ้าไม่มีกลไกนี้ ฐานข้อมูลทั้งชุดจะกลายเป็นขยะภายในหนึ่งรอบปี
มี test บังคับ: `test/docTypes.test.ts`

**5. ไม่เก็บรูปเอกสาร**
`image_purge_after` ตั้งไว้ 30 วันตอนบันทึก · cron `/api/cron/purge-images` ลบให้
ประหยัด storage ลดความเสียหายถ้าข้อมูลรั่ว และเป็นจุดขายที่คู่แข่งพูดไม่ได้

## โครงสร้าง

```
src/
  app/
    api/line/webhook/         รับ event จาก LINE (reply เท่านั้น)
    api/cron/reminders/       Vercel Cron — ที่เดียวที่ push
    api/cron/purge-images/    PDPA — ลบรูปต้นฉบับ
    api/liff/documents/       ข้อมูลหน้า "รายการของฉัน"
    api/liff/join/            บันทึกว่าสแกน QR มาจากร้านไหน
    liff/                     หน้า "รายการของฉัน"
  lib/
    line/client.ts            reply() / push() / getMessageContent()
    line/messages.ts          ข้อความทุกชิ้นที่บอทพูด (ฉาก 01-11)
    line/handlers.ts          ตัวจัดการ event ทั้งหมด
    ocr/                      adapter — เปลี่ยน provider ได้ที่ index.ts จุดเดียว
    domain/docTypes.ts        ทะเบียนประเภทเอกสาร + tier + จังหวะการเตือน
    domain/reminders.ts       คำนวณคิว + rollover
    domain/thaiDate.ts        พ.ศ./ค.ศ. และวันที่ทั้งหมด
    reminders/run.ts          เครื่องยนต์การเตือน
    db/                       Supabase (service role)
supabase/migrations/          0001 core · 0002 rls · 0003 views · 0004 state
test/                         29 tests
```

## ตั้งค่าครั้งแรก

1. ทำตามคู่มือตั้งค่า LINE OA + Supabase (ดูลิงก์ที่ Claude ส่งให้)
2. `cp .env.example .env.local` แล้วเติมค่าให้ครบ
3. รัน migration ทั้ง 4 ไฟล์ใน Supabase SQL Editor เรียงตามเลข
4. `npm install`
5. `npm run dev`

## คำสั่ง

```bash
npm run dev         # dev server
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm test            # 29 tests
npm run richmenu -- path/to/menu.png   # ตั้ง rich menu (รันครั้งเดียว)
```

## ทดสอบ cron โดยไม่ต้องรอถึงพรุ่งนี้

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/reminders
```

คืนสรุปพร้อม `estimated_cost_thb` ของรอบนั้น — ดูได้ทุกวันว่าเงินไปไหน

## ตัวเลขที่ต้องจ้องใน 90 วันแรก

```sql
select * from v_kpi;                -- เอกสารเฉลี่ยต่อคน · % ที่มี 3 ใบขึ้นไป
select * from v_shop_performance;   -- ผลของแต่ละร้าน (ตัวเลขไว้ "ขาย" ไม่ใช่ "เก็บเงิน")
```

**1 ใบ = แค่ลองเล่น ลืมเราใน 2 สัปดาห์ · 3 ใบขึ้นไป = เขาย้ายความทรงจำมาไว้ที่เราแล้ว**

## ยังไม่ได้ทำใน v1 (ตั้งใจ)

- ระบบชำระเงิน 12 บาท/ปี — ขอเงินหลังเตือนสำเร็จครั้งแรก ไม่ใช่ตอนสมัคร
- ระบบ "ให้เราต่อให้" อัตโนมัติ — 20 เคสแรกทำมือ เพื่อรู้ว่าคนติดตรงไหนจริง
- อัปโหลดรูปขึ้น Supabase Storage — ตอนนี้อ่านแล้วทิ้งเลย ไม่เก็บ
