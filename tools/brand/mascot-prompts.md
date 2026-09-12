# คำสั่งสร้างมาสคอตชุดใหม่

12 ตัวแรกมาจากตัวสร้างภาพ ไม่ใช่ไฟล์เวกเตอร์ที่แก้ได้ การจะได้ตัวใหม่
ที่ดูเป็น "พี่น้องกัน" จึงต้องล็อกสไตล์ให้เหมือนเดิมทุกข้อ แล้วเปลี่ยนแค่ท่าทาง

ถ้าปล่อยให้ตัวสร้างภาพตีความสไตล์เอง มันจะเพี้ยนทีละนิดทุกครั้ง
จนชุดสุดท้ายกลายเป็นมาสคอตคนละตัวที่บังเอิญเป็นกระดาษเหมือนกัน

---

## ส่วนที่ห้ามเปลี่ยน (วางนำหน้าทุกคำสั่ง)

```
3D render, soft matte clay/plastic look, kawaii mascot character:
a white rounded-square paper document with a folded top-right corner in
bright sky blue (#3BA9F5), three short horizontal text lines in light blue
across its body, simple black dot eyes with a small happy curved mouth,
soft pink oval blush on both cheeks, tiny stubby black rounded arms and legs.

Studio lighting from the upper left, soft ambient occlusion, gentle drop shadow.
Transparent background. Centered, full body, slight three-quarter tilt.
Clean, cute, friendly, modern app-icon quality. No text, no letters, no numbers.
```

## ส่วนที่เปลี่ยนตามท่า

ต่อท้ายคำสั่งข้างบนด้วยบรรทัดเดียว แล้วเลือกของประกอบให้ตรงกับโอกาสที่จะใช้

| ใช้ตอนไหน | ต่อท้ายว่า |
|---|---|
| บันทึกสำเร็จ | `giving a big thumbs up with one arm raised, eyes closed in a happy smile, small green sparkle marks around` |
| ยังไม่มีเอกสารสักใบ | `shrugging with both tiny arms out to the sides, puzzled dot eyes, a small question mark floating above` |
| อ่านรูปไม่ออก | `tilting sideways looking confused, one arm scratching its head, a small spiral confusion mark above` |
| ทักทายครั้งแรก | `making a Thai wai greeting, both tiny arms pressed together in front, eyes closed, warm smile` |
| ระบบเงียบ ไม่มีอะไรต้องเตือน | `sleeping peacefully, eyes as closed curved lines, a small "z" shape floating above, resting on its side` |
| ชี้ไปที่แผนที่ | `pointing forward with one arm, cheerful open smile, a small teal map pin floating beside it` |
| เรื่องวันที่ | `holding a small light blue desk calendar with both arms, looking down at it with interest` |
| ชวนถ่ายรูป | `holding a small white and blue instant camera with both arms, one eye winking` |
| เรื่องเงิน ค่าบริการ | `holding a small yellow coin with both arms, delighted expression, tiny sparkles around the coin` |
| ต่ออายุเรียบร้อย | `wearing a tiny party hat, both arms raised in celebration, small colorful confetti pieces around` |
| ลบข้อมูลแล้ว | `waving goodbye with one arm, gentle closed-eye smile, slightly translucent fading effect` |
| กำลังประมวลผล | `spinning in place with motion blur streak lines around it, eyes as excited curved lines` |

## ข้อควรระวัง

1. **กระดิ่งไม่ต้องมีทุกตัว** — กระดิ่งคือ "การเตือน" ถ้าใส่ในท่าที่ไม่ได้เกี่ยวกับการเตือน
   มันจะสื่อผิด และทำให้ท่าที่เตือนจริง ๆ ไม่โดดเด่นอีกต่อไป

2. **สั่งทีละหลายตัวในภาพเดียว** (ตาราง 4x3 แบบเดิม) ได้ตัวที่หน้าตาเข้ากันกว่า
   สั่งทีละตัวแล้วเอามารวม เพราะโมเดลเห็นตัวอื่นเป็นตัวอ้างอิงในภาพเดียวกัน
   ต่อท้ายว่า `12 poses arranged in a 4x3 grid on one transparent sheet, even spacing`

3. **ได้แผ่นใหม่มาแล้ว** วางไว้ที่ `tools/brand/` แล้วรัน
   `python3 tools/split_mascot.py` (แก้ชื่อไฟล์กับรายการ `NAMES` ข้างในก่อน)
   จะตัดเป็นไฟล์ละตัวพื้นหลังโปร่งใสให้เอง

4. **ขอพื้นหลังโปร่งใสเสมอ** ถ้าได้พื้นขาวมา ตัดออกไม่ได้ เพราะตัวมาสคอตเองก็ขาว
