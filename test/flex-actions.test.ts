import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as M from '../src/lib/line/messages';

/**
 * ตั้งก่อนได้เลยแม้ import จะถูกยกขึ้นไปบนสุด
 * เพราะ env.ts อ่านค่าแบบ lazy ตอนเรียกใช้ ไม่ใช่ตอน import
 * (ถ้าใช้ top-level await แทน tsx จะ transform เป็น CJS แล้วพัง)
 */
process.env.NEXT_PUBLIC_LIFF_ID ||= '1234567890-test';

/**
 * LINE ให้ location / camera / cameraRoll ใช้ได้เฉพาะใน quick reply
 *
 * ใส่ลง Flex button เมื่อไหร่ ข้อความจะไม่ผ่าน validation ทั้งก้อน
 * ตอบกลับมาแค่ 400 "message is invalid" โดยไม่บอกว่าฟิลด์ไหน
 * แล้วผู้ใช้จะเจอความเงียบสนิท เพราะ reply token ถูกใช้ไปแล้ว
 *
 * ตรวจจากโครงสร้างข้อความจริงที่ builder สร้างออกมา ไม่ใช่ค้นข้อความในไฟล์
 */
const QUICK_REPLY_ONLY = new Set(['location', 'camera', 'cameraRoll']);

function findBadButtons(node: unknown, path = '$'): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((n, i) => findBadButtons(n, `${path}[${i}]`));
  }
  if (!node || typeof node !== 'object') return [];

  const o = node as Record<string, any>;
  const bad: string[] = [];

  if (o.type === 'button' && o.action && QUICK_REPLY_ONLY.has(o.action.type)) {
    bad.push(`${path} → button ใช้ action "${o.action.type}" ซึ่งใช้ได้เฉพาะใน quick reply`);
  }

  for (const [k, v] of Object.entries(o)) {
    // ข้าม quickReply เพราะตรงนั้นใช้ได้ถูกต้องแล้ว
    if (k === 'quickReply') continue;
    bad.push(...findBadButtons(v, `${path}.${k}`));
  }
  return bad;
}

const items = [
  { documentId: 'd1', typeKey: 'vehicle_tax', label: '1กก 1234', expiry: '2026-12-15', offsetDays: -30 },
  { documentId: 'd2', typeKey: 'national_id', label: null, expiry: '2026-12-15', offsetDays: -30 },
];

test('การ์ดเตือนล่วงหน้า ไม่มี action ต้องห้ามใน Flex button', () => {
  const actions = {
    vehicle_tax: [
      { kind: 'upsell' as const, label: '🛵 ให้เราต่อให้' },
      { kind: 'link' as const, label: '💻 ต่อออนไลน์', url: 'https://eservice.dlt.go.th' },
      { kind: 'location' as const, label: '📍 ตรอ. ใกล้ฉัน', searchTerm: 'ตรอ.' },
    ],
    national_id: [
      { kind: 'location' as const, label: '📍 ที่ว่าการอำเภอ', searchTerm: 'ที่ว่าการอำเภอ' },
    ],
  };
  for (const msg of M.upcomingReminder(items, '2026-11-15', actions)) {
    assert.deepEqual(findBadButtons(msg), []);
  }
});

test('การ์ดอื่น ๆ ก็ต้องสะอาดเหมือนกัน', () => {
  const all = [
    ...M.dueReminder(items),
    ...M.pickRenewed(items, '2026-11-15'),
    ...M.confirmExtracted({ documentId: 'd1', typeKey: 'vehicle_tax', label: '1กก 1234', expiry: '2026-12-15', today: '2026-11-15' }),
  ];
  for (const msg of all) {
    assert.deepEqual(findBadButtons(msg), []);
  }
});

test('ปุ่มขอตำแหน่งยังต้องมีอยู่ แค่ย้ายไป quick reply', () => {
  const actions = {
    national_id: [{ kind: 'location' as const, label: '📍 ที่ว่าการอำเภอ', searchTerm: 'ที่ว่าการอำเภอ' }],
  };
  const [card] = M.upcomingReminder([items[1]], '2026-11-15', actions) as any[];
  const types = (card.quickReply?.items ?? []).map((i: any) => i.action.type);
  assert.ok(types.includes('location'), 'ต้องมีปุ่มขอตำแหน่งใน quick reply');
});
