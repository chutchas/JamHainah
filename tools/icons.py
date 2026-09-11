#!/usr/bin/env python3
"""
ชุดไอคอนของ "จำให้นะ"

วาดเองเพราะ emoji ถูกวาดโดยระบบปฏิบัติการ ไม่ใช่โดยเรา
ไอคอนเดียวกันจึงหน้าตาต่างกันระหว่าง iPhone / Android / LINE เวอร์ชันเก่า

กติกาเดียวของชุดนี้: เส้นหนาเท่ากัน ปลายมนเท่ากัน สีเดียว ช่องไฟเท่ากัน
รูปทรงเรียบที่สุดที่ยังอ่านออกตอนย่อเหลือ 24px
"""
import os
import cairosvg

# ไล่สีทแยงมุม เขียวอมฟ้าไปเขียวสด — ตัวเดียวกันทุกไอคอน
# ไล่สีคนละองศาในแต่ละไอคอน จะทำให้ชุดดูไม่เป็นชุดเดียวกันทันที
TEAL = "#0B8A72"
GREEN = "#22A74C"
W = 8  # เส้นหนา 8 ที่ 96px = 2px ตอนแสดงจริง

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
    # เอกสารของฉัน
    "doc": """
      <path d="M34 16h22l14 14v48a6 6 0 0 1-6 6H34a6 6 0 0 1-6-6V22a6 6 0 0 1 6-6z"/>
      <path d="M56 16v14h14"/>
      <path d="M40 54h18M40 66h12"/>
    """,
    # ส่งรูปเอกสาร
    "camera": """
      <path d="M22 36h10l6-8h20l6 8h10a6 6 0 0 1 6 6v28a6 6 0 0 1-6 6H22a6 6 0 0 1-6-6V42a6 6 0 0 1 6-6z"/>
      <circle cx="48" cy="56" r="13"/>
    """,
    # เลือกวันที่
    "calendar": """
      <rect x="18" y="26" width="60" height="52" rx="7"/>
      <path d="M34 16v18M62 16v18M18 44h60"/>
    """,
    # ถูกต้อง / ต่อแล้ว
    "check": """
      <circle cx="48" cy="48" r="30"/>
      <path d="M34 49l10 11 20-24"/>
    """,
    # แก้ไข
    "edit": """
      <path d="M62 20l14 14-38 38-18 4 4-18z"/>
      <path d="M55 27l14 14"/>
    """,
    # ต่ออายุ
    "renew": """
      <path d="M48 20A28 28 0 1 0 67.8 28.2"/>
      <path d="M82.6 33.2 67.8 28.2 72.8 43"/>
    """,
    # เพิ่ม / คนละใบ
    "plus": """
      <circle cx="48" cy="48" r="30"/>
      <path d="M48 33v30M33 48h30"/>
    """,
    # แผนที่ ใกล้ฉัน
    "pin": """
      <path d="M48 82S23 57 23 41a25 25 0 1 1 50 0c0 16-25 41-25 41z"/>
      <circle cx="48" cy="40" r="9"/>
    """,
    # ทำออนไลน์
    "globe": """
      <circle cx="48" cy="48" r="30"/>
      <path d="M18 48h60"/>
      <path d="M48 18a40 40 0 0 1 0 60a40 40 0 0 1 0-60z"/>
    """,
    # คุยกับคน
    "chat": """
      <path d="M24 26h48a7 7 0 0 1 7 7v26a7 7 0 0 1-7 7H46L30 80V66h-6a7 7 0 0 1-7-7V33a7 7 0 0 1 7-7z"/>
    """,
    # ให้เราต่อให้ — บริการที่เราลงมือทำแทน
    "spark": """
      <path d="M48 14c4 19 11 26 30 30-19 4-26 11-30 30-4-19-11-26-30-30 19-4 26-11 30-30z"
            fill="url(#g)" stroke-width="0"/>
    """,
    # เตือน / ยังก่อน
    "bell": """
      <path d="M31 64V49a17 17 0 0 1 34 0v15l7 9H24z"/>
      <path d="M41 78a7 7 0 0 0 14 0"/>
      <path d="M48 32v-7"/>
    """,
    # ไม่ได้ใช้แล้ว
    "box": """
      <rect x="17" y="26" width="62" height="16" rx="5"/>
      <path d="M24 42v30a6 6 0 0 0 6 6h36a6 6 0 0 0 6-6V42"/>
      <path d="M40 56h16"/>
    """,
    # ยกเลิก
    "close": """
      <circle cx="48" cy="48" r="30"/>
      <path d="M37 37l22 22M59 37L37 59"/>
    """,
}

out = os.path.join(os.path.dirname(__file__), "icons")
os.makedirs(out, exist_ok=True)

for name, body in ICONS.items():
    svg = HEAD + body + TAIL
    cairosvg.svg2png(
        bytestring=svg.encode("utf-8"),
        write_to=os.path.join(out, f"{name}.png"),
        output_width=96,
        output_height=96,
    )
    print(name)
