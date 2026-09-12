#!/usr/bin/env python3
"""
ไอคอนประเภทเอกสาร — ชุดเดียวกับไอคอนปุ่ม ต่างกันแค่ว่าอันนี้บอก "เอกสารอะไร"

ทำไมไม่ใช้ emoji เหมือนเดิม:
  emoji ของระบบมีสีจัดและรายละเอียดเยอะ มันดึงสายตาไปจากตัวเลขวันหมดอายุ
  ซึ่งเป็นของสำคัญเพียงอย่างเดียวบนการ์ดนั้น
  ไอคอนเส้นสีเดียวทำหน้าที่บอกประเภทได้เท่ากัน โดยไม่แย่งความสนใจ
"""
import os
import cairosvg

TEAL = "#0B8A72"
GREEN = "#4FC49B"
W = 7

HEAD = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">'
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
    f'<stop offset="0" stop-color="{TEAL}"/><stop offset="1" stop-color="{GREEN}"/>'
    "</linearGradient></defs>"
    f'<g fill="none" stroke="url(#g)" stroke-width="{W}" '
    'stroke-linecap="round" stroke-linejoin="round">'
)
TAIL = "</g></svg>"

ICONS = {
    # ภาษีรถ — รถยนต์
    "vehicle_tax": """
      <path d="M20 62V50l7-16a7 7 0 0 1 6-4h30a7 7 0 0 1 6 4l7 16v12"/>
      <path d="M20 50h56"/>
      <circle cx="32" cy="62" r="6"/><circle cx="64" cy="62" r="6"/>
    """,
    # พ.ร.บ. — โล่ (ความคุ้มครองภาคบังคับ)
    "cmi": """
      <path d="M48 14l26 10v20c0 18-12 30-26 38-14-8-26-20-26-38V24z"/>
    """,
    # ประกันรถ — ร่ม (ความคุ้มครองที่เลือกเอง)
    "motor_insurance": """
      <path d="M14 52a34 34 0 0 1 68 0z"/>
      <path d="M48 52v20a9 9 0 0 1-18 0"/>
    """,
    # ตรวจสภาพรถ — ประแจ
    "vehicle_inspection": """
      <path d="M66 18a16 16 0 0 0-21 21L22 62a8 8 0 0 0 11 11l23-23a16 16 0 0 0 21-21L66 40l-10-3-3-10z"/>
    """,
    # ใบขับขี่ — พวงมาลัย
    "driving_license": """
      <circle cx="48" cy="48" r="30"/><circle cx="48" cy="48" r="9"/>
      <path d="M48 57v21M40 44 22 34M56 44l18-10"/>
    """,
    # บัตรประชาชน — บัตรมีรูปคน
    "national_id": """
      <rect x="14" y="24" width="68" height="48" rx="8"/>
      <circle cx="36" cy="43" r="7"/>
      <path d="M26 60a10 10 0 0 1 20 0"/>
      <path d="M58 40h16M58 52h12"/>
    """,
    # พาสปอร์ต — เล่มมีลูกโลก
    "passport": """
      <rect x="22" y="14" width="52" height="68" rx="7"/>
      <circle cx="48" cy="42" r="13"/>
      <path d="M35 42h26M48 29a20 20 0 0 1 0 26a20 20 0 0 1 0-26z"/>
      <path d="M38 68h20"/>
    """,
    # วีซ่า — เครื่องบิน
    "visa": """
      <path d="M84 16 14 44l24 8 8 26 10-18 18 14z"/>
      <path d="M38 52 84 16"/>
    """,
    # ใบอนุญาตทำงาน — กระเป๋าเอกสาร
    "work_permit": """
      <rect x="14" y="32" width="68" height="42" rx="8"/>
      <path d="M36 32v-7a7 7 0 0 1 7-7h10a7 7 0 0 1 7 7v7"/>
      <path d="M14 50h68"/>
    """,
    # ประกันสุขภาพ — กากบาทในวงกลม
    "health_insurance": """
      <circle cx="48" cy="48" r="30"/>
      <path d="M48 34v28M34 48h28"/>
    """,
    # ประกันชีวิต — หัวใจ
    "life_insurance": """
      <path d="M48 78C48 78 18 58 18 39a16 16 0 0 1 30-8 16 16 0 0 1 30 8c0 19-30 39-30 39z"/>
    """,
    # ประกันสังคม — คนสองคน
    "social_security": """
      <circle cx="36" cy="36" r="11"/>
      <path d="M16 72a20 20 0 0 1 40 0"/>
      <path d="M62 26a11 11 0 0 1 0 22"/>
      <path d="M66 54a20 20 0 0 1 14 18"/>
    """,
    # ใบอนุญาตวิชาชีพ — ประกาศนียบัตรมีตรา
    "professional_license": """
      <rect x="16" y="14" width="64" height="44" rx="7"/>
      <path d="M30 30h36M30 42h22"/>
      <circle cx="48" cy="68" r="9"/>
      <path d="M41 76 36 88l12-5 12 5-5-12"/>
    """,
    # สัญญาเช่า — บ้าน
    "lease": """
      <path d="M14 46 48 18l34 28"/>
      <path d="M24 42v34h48V42"/>
      <path d="M40 76V58h16v18"/>
    """,
    # อื่น ๆ — ป้ายคั่น
    "custom": """
      <path d="M28 14h40a7 7 0 0 1 7 7v61L48 66 21 82V21a7 7 0 0 1 7-7z"/>
    """,
}

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docicons")
os.makedirs(out, exist_ok=True)
for name, body in ICONS.items():
    cairosvg.svg2png(bytestring=(HEAD + body + TAIL).encode("utf-8"),
                     write_to=os.path.join(out, f"{name}.png"),
                     output_width=96, output_height=96)
    print(name)
