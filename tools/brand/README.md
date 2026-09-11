# รูปของแบรนด์ "จำให้นะ"

## ของจริงที่ใช้อยู่

| ไฟล์ | ใช้ที่ไหน | ใครทำ |
|---|---|---|
| `Icon-LineOA.png` | รูปโปรไฟล์ LINE OA — **อันนี้คืออันจริง** | Tum |
| `Mascot-main.png` · `Mascot-Act.png` | มาสคอต ยังไม่ได้เอาไปใช้ที่ไหน | Tum |
| `richmenu_background.png` | พื้นหลัง rich menu ยังไม่ได้เอาไปใช้ | Tum |
| `richmenu.png` | รูป rich menu ที่ `tools/richmenu.mjs` อัปโหลดจริง | สร้างจาก `richmenu.html` |

`src/app/icon.png` และ `src/app/apple-icon.png` เป็นรูปเดียวกับ `Icon-LineOA.png`
ย่อลงมาเป็น favicon ของหน้าเอกสารของฉัน — ไฟล์ต้นฉบับ 1.2MB ใหญ่เกินกว่าจะให้
ทุกคนโหลดเพื่อแสดงผลขนาด 32px

## รูปที่สร้างจากโค้ด

`richmenu.html` · `icon.html` · `icon-b.html` เรนเดอร์ด้วย `node render.cjs`
(ต้องมี playwright) ส่วนไอคอนใน quick reply อยู่ที่ `public/icons`
สร้างจาก `tools/icons.py`

`oa-icon.png` / `oa-icon-b.png` เป็นรูปโปรไฟล์ที่เคยทำไว้ก่อนจะมีของจริง
เก็บไว้เผื่อเทียบ ไม่ได้ใช้แล้ว

## สีไล่ของไอคอน

`#0b8a72` → `#4fc49b` ทแยงมุม องศาเดียวกันทุกอัน
แก้ที่ `tools/icons.py` แล้วรันใหม่ ได้ทั้งชุดพร้อมกัน
