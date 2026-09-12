#!/usr/bin/env python3
"""
แตกแผ่นรวมมาสคอต (Mascot-Act.png) ออกเป็นไฟล์ละตัว

ทำไมไม่ตัดตามตาราง 4x3 ตรง ๆ:
  ท่าทางแต่ละตัวล้นออกนอกช่องของตัวเอง — กระดิ่ง ประกายเส้น หัวใจ
  ตัดตามเส้นตารางเมื่อไหร่ ของพวกนั้นจะขาดกลาง
  จึงหา "ก้อน" จากช่องโปร่งใสจริง แล้วค่อยจับก้อนเข้าช่องที่ใกล้ที่สุด

พื้นหลังโปร่งใสอยู่แล้วในไฟล์ต้นฉบับ ไม่ต้องไล่สีขาวออก
(ซึ่งทำไม่ได้อยู่แล้ว เพราะตัวมาสคอตเองก็เป็นกระดาษสีขาว)
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = 'act.png'
OUT = 'mascot'
COLS, ROWS = 4, 3
PAD = 14          # เผื่อขอบรอบตัว กันเส้นโดนตัดเรียบ
ALPHA_MIN = 24    # ต่ำกว่านี้คือเงาจาง ๆ ไม่ใช่ตัวรูป

# ชื่อตามท่าทางที่เห็นในรูป เรียงซ้ายไปขวา บนลงล่าง
NAMES = [
    'wave', 'cheer', 'hug-bell', 'excited',
    'sleep', 'peek', 'search', 'wink',
    'happy', 'run', 'love', 'announce',
]

im = Image.open(SRC).convert('RGBA')
W, H = im.size
alpha = np.array(im)[:, :, 3]

mask = alpha > ALPHA_MIN
labels, n = ndimage.label(mask)
sizes = ndimage.sum(np.ones_like(labels), labels, range(1, n + 1))
slices = ndimage.find_objects(labels)

# ตัวมาสคอตใหญ่กว่าประกาย/หัวใจ ราว 40 เท่า แยกได้ชัดด้วยเส้นเดียว
BODY_MIN = 5000
bodies = [i for i in range(n) if sizes[i] >= BODY_MIN]
assert len(bodies) == COLS * ROWS, f'เจอตัวมาสคอต {len(bodies)} ตัว ควรได้ {COLS*ROWS}'

def bbox(i):
    ys, xs = slices[i]
    return [xs.start, ys.start, xs.stop, ys.stop]

def gap(a, b):
    """ระยะห่างระหว่างกรอบสองอัน — 0 ถ้าซ้อนกัน"""
    dx = max(a[0] - b[2], b[0] - a[2], 0)
    dy = max(a[1] - b[3], b[1] - a[3], 0)
    return (dx * dx + dy * dy) ** .5

# เรียงตัวมาสคอตตามตำแหน่งบนแผ่น (ซ้ายไปขวา บนลงล่าง) ไม่ใช่ตามลำดับที่ scipy เจอ
cw, ch = W / COLS, H / ROWS
def cell_of(i):
    x0, y0, x1, y1 = bbox(i)
    return (int(((y0 + y1) / 2) // ch), int(((x0 + x1) / 2) // cw))
bodies.sort(key=cell_of)

boxes = {k: bbox(i) for k, i in enumerate(bodies)}
parts = {k: [i] for k, i in enumerate(bodies)}   # ก้อนที่เป็นของแต่ละตัว

"""
ประกาย หัวใจ และเส้นบอกการเคลื่อนไหว เป็นก้อนแยกจากตัว
ต้องจับเข้าตัวที่ใกล้ที่สุด "โดยวัดจากตัวรูปจริง" ไม่ใช่จากกรอบสี่เหลี่ยม

กรอบสี่เหลี่ยมของท่าที่เอียง ๆ กินพื้นที่ว่างเยอะมาก ประกายของตัวข้าง ๆ
จึงตกไปอยู่ในกรอบของตัวที่ไม่ใช่เจ้าของ แล้วติดมาเป็นเศษในไฟล์ที่ตัดออกมา

หาเจ้าของด้วย distance transform ครั้งเดียว: ทุกพิกเซลรู้ว่าพิกเซลของตัวมาสคอต
ที่ใกล้ที่สุดอยู่ตรงไหน แล้วให้ก้อนเล็กโหวตว่าส่วนใหญ่ชี้ไปที่ตัวไหน
"""
owner = np.zeros_like(labels)
for k, i in enumerate(bodies, start=1):
    owner[labels == i + 1] = k

_, (iy, ix) = ndimage.distance_transform_edt(owner == 0, return_indices=True)
nearest = owner[iy, ix]

for i in range(n):
    if i in bodies or sizes[i] < 60:
        continue
    m = labels == i + 1
    vote = np.bincount(nearest[m], minlength=len(bodies) + 1)
    k = int(vote[1:].argmax())
    b = bbox(i)
    cur = boxes[k]
    boxes[k] = [min(cur[0], b[0]), min(cur[1], b[1]), max(cur[2], b[2]), max(cur[3], b[3])]
    parts[k].append(i)

os.makedirs(OUT, exist_ok=True)

for k in sorted(boxes):
    x0, y0, x1, y1 = boxes[k]
    x0, y0 = max(0, x0 - PAD), max(0, y0 - PAD)
    x1, y1 = min(W, x1 + PAD), min(H, y1 + PAD)
    """
    ตัดเป็นสี่เหลี่ยมเฉย ๆ ไม่พอ — กรอบของท่าที่กางแขนจะกินเข้าไปในตัวข้าง ๆ
    แล้วหัวใจหรือประกายของเพื่อนบ้านจะติดมาเป็นเศษลอยอยู่ริมภาพ
    จึงลบทุกพิกเซลที่ไม่ได้เป็นของตัวนี้ออกก่อน
    """
    keep = np.isin(labels[y0:y1, x0:x1], [i + 1 for i in parts[k]])
    cell = np.array(im.crop((x0, y0, x1, y1)))
    cell[:, :, 3] = np.where(keep, cell[:, :, 3], 0)
    crop = Image.fromarray(cell)

    # ทำเป็นจัตุรัส เพื่อให้ทุกตัวย่อขยายด้วยขนาดเดียวกันแล้วดูสมส่วนเท่ากัน
    side = max(crop.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(crop, ((side - crop.width) // 2, (side - crop.height) // 2), crop)
    sq = sq.resize((512, 512), Image.LANCZOS)

    name = f'{k + 1:02d}-{NAMES[k]}.png'
    sq.save(os.path.join(OUT, name), optimize=True)
    print(name, f'{x1-x0}x{y1-y0}', os.path.getsize(os.path.join(OUT, name)))
