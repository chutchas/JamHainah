/**
 * ติดตั้ง rich menu ของ "จำให้นะ"
 *
 *   node tools/richmenu.mjs           ติดตั้ง/อัปเดตให้เป็นเมนูหลักของทุกคน
 *   node tools/richmenu.mjs --list    ดูว่าตอนนี้มีเมนูอะไรอยู่บ้าง
 *
 * อ่าน token จาก .env.local — ไม่ต้องส่ง key ผ่านที่ไหนทั้งสิ้น
 *
 * ทำไมเป็นสคริปต์ ไม่ใช่กดในหน้า LINE OA Manager:
 *   พื้นที่กดของเมนูต้องตรงกับรูปเป๊ะ ๆ ถ้าวันหนึ่งเปลี่ยนรูป
 *   แล้วต้องมาลากกรอบใหม่ด้วยมือ มันจะเพี้ยนโดยไม่มีใครรู้
 *   ไฟล์นี้ทำให้รูปกับพื้นที่กดเปลี่ยนไปพร้อมกันเสมอ
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

async function loadEnv() {
  const raw = await readFile(join(root, '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
  }
}

const api = (path, init = {}) =>
  fetch(`https://api.line.me${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      ...(init.body && !init.headers ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

async function json(res, what) {
  const text = await res.text();
  if (!res.ok) throw new Error(`${what}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

/**
 * พื้นที่กดต้องบวกกันได้ 2500 พอดี ไม่งั้นจะมีแถบตายอยู่ตรงรอยต่อ
 * ซึ่งผู้ใช้จะเจอเป็น "กดแล้วไม่เกิดอะไร" โดยไม่มีทางรู้ว่าทำไม
 */
const W = 2500;
const H = 843;
const COL = [
  [0, 833],
  [833, 834],
  [1667, 833],
];

function menu(liffUrl) {
  return {
    size: { width: W, height: H },
    selected: true,
    name: 'จำให้นะ · เมนูหลัก',
    chatBarText: 'เมนู',
    areas: [
      {
        bounds: { x: COL[0][0], y: 0, width: COL[0][1], height: H },
        // rich menu เปิดกล้องตรง ๆ ไม่ได้ (ไม่มี action ชนิด camera)
        // จึงตอบด้วยข้อความที่มีปุ่มกล้องให้ — และบอกทางพิมพ์ไปด้วยในตัว
        action: { type: 'postback', data: 'a=add', displayText: 'เพิ่มเอกสาร' },
      },
      {
        bounds: { x: COL[1][0], y: 0, width: COL[1][1], height: H },
        action: { type: 'uri', label: 'เอกสารของฉัน', uri: liffUrl },
      },
      {
        bounds: { x: COL[2][0], y: 0, width: COL[2][1], height: H },
        action: { type: 'postback', data: 'a=human', displayText: 'คุยกับคน' },
      },
    ],
  };
}

async function list() {
  const { richmenus } = await json(await api('/v2/bot/richmenu/list'), 'list');
  if (!richmenus?.length) return console.log('ยังไม่มี rich menu');
  for (const m of richmenus) console.log(`${m.richMenuId}  ${m.name}`);
}

async function install() {
  await loadEnv();
  const liffUrl = `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}`;
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) throw new Error('ไม่พบ LINE_CHANNEL_ACCESS_TOKEN ใน .env.local');
  if (!process.env.NEXT_PUBLIC_LIFF_ID) throw new Error('ไม่พบ NEXT_PUBLIC_LIFF_ID ใน .env.local');

  const created = await json(
    await api('/v2/bot/richmenu', { method: 'POST', body: JSON.stringify(menu(liffUrl)) }),
    'สร้างเมนู'
  );
  const id = created.richMenuId;
  console.log('สร้างแล้ว', id);

  const png = await readFile(join(here, 'brand/richmenu.png'));
  const up = await fetch(`https://api-data.line.me/v2/bot/richmenu/${id}/content`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      'Content-Type': 'image/png',
    },
    body: png,
  });
  await json(up, 'อัปโหลดรูป');
  console.log('อัปโหลดรูปแล้ว');

  await json(await api(`/v2/bot/user/all/richmenu/${id}`, { method: 'POST' }), 'ตั้งเป็นเมนูหลัก');
  console.log('ตั้งเป็นเมนูหลักของทุกคนแล้ว');

  // เก็บกวาดของเก่า ไม่งั้นเมนูที่เลิกใช้จะกองอยู่จนสับสนว่าอันไหนคืออันจริง
  const { richmenus } = await json(await api('/v2/bot/richmenu/list'), 'list');
  for (const m of richmenus ?? []) {
    if (m.richMenuId === id) continue;
    await api(`/v2/bot/richmenu/${m.richMenuId}`, { method: 'DELETE' });
    console.log('ลบเมนูเก่า', m.richMenuId);
  }
}

const cmd = process.argv[2];
if (cmd === '--list') await loadEnv().then(list);
else await install();
