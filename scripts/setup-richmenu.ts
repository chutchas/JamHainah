/**
 * ตั้ง rich menu 6 ช่อง — รันครั้งเดียวหลังตั้ง LINE OA เสร็จ
 *   npx tsx scripts/setup-richmenu.ts path/to/richmenu.png
 *
 * รูปต้องเป็น 2500x1686 px (หรือ 2500x843 สำหรับ 3 ช่อง) ขนาดไม่เกิน 1MB
 *
 * ปุ่ม "คุยกับคน" ต้องมีตั้งแต่วันแรก — อย่าพยายามให้บอทตอบทุกอย่างใน v1
 * คนถามอะไรแปลก ๆ ให้เข้าห้องแชทเรา นั่นคือ user research ที่ดีที่สุดที่จะได้
 */
import fs from 'node:fs';

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID;
if (!TOKEN) { console.error('ต้องมี LINE_CHANNEL_ACCESS_TOKEN'); process.exit(1); }

const W = 2500, H = 1686, CW = Math.floor(W / 3), CH = Math.floor(H / 2);
const cell = (col: number, r: number) => ({ x: col * CW, y: r * CH, width: CW, height: CH });

const menu = {
  size: { width: W, height: H },
  selected: true,
  name: 'main-v1',
  chatBarText: 'เมนู',
  areas: [
    { bounds: cell(0, 0), action: { type: 'camera', label: 'เพิ่มเอกสาร' } },
    { bounds: cell(1, 0), action: LIFF_ID
        ? { type: 'uri', label: 'รายการของฉัน', uri: `https://liff.line.me/${LIFF_ID}` }
        : { type: 'postback', label: 'รายการของฉัน', data: 'a=list' } },
    { bounds: cell(2, 0), action: { type: 'postback', label: 'ใกล้หมดอายุ', data: 'a=list' } },
    { bounds: cell(0, 1), action: { type: 'postback', label: 'ให้เราต่อให้', data: 'a=upsell' } },
    { bounds: cell(1, 1), action: { type: 'postback', label: 'ตั้งค่า', data: 'a=settings' } },
    { bounds: cell(2, 1), action: { type: 'postback', label: 'คุยกับคน', data: 'a=human' } },
  ],
};

async function main() {
  const imagePath = process.argv[2];
  if (!imagePath || !fs.existsSync(imagePath)) {
    console.error('ใช้: npx tsx scripts/setup-richmenu.ts <path ไปยังรูป 2500x1686 png>');
    process.exit(1);
  }

  const created = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(menu),
  });
  if (!created.ok) { console.error('สร้าง rich menu ไม่สำเร็จ:', await created.text()); process.exit(1); }
  const { richMenuId } = (await created.json()) as { richMenuId: string };
  console.log('สร้างแล้ว:', richMenuId);

  const img = fs.readFileSync(imagePath);
  const up = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: { 'Content-Type': imagePath.endsWith('.jpg') ? 'image/jpeg' : 'image/png', Authorization: `Bearer ${TOKEN}` },
    body: img,
  });
  if (!up.ok) { console.error('อัปโหลดรูปไม่สำเร็จ:', await up.text()); process.exit(1); }

  const setDefault = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
    method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!setDefault.ok) { console.error('ตั้งเป็นเมนูหลักไม่สำเร็จ:', await setDefault.text()); process.exit(1); }

  console.log('เรียบร้อย — rich menu ใช้งานได้แล้ว');
}

main().catch((e) => { console.error(e); process.exit(1); });
