import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as M from '../src/lib/line/messages';

/**
 * ตั้งก่อนได้เลยแม้ import จะถูกยกขึ้นไปบนสุด
 * เพราะ env.ts อ่านค่าแบบ lazy ตอนเรียกใช้ ไม่ใช่ตอน import
 * (ถ้าใช้ top-level await แทน tsx จะ transform เป็น CJS แล้วพัง)
 */
process.env.NEXT_PUBLIC_LIFF_ID ||= '1234567890-test';
process.env.NEXT_PUBLIC_BASE_URL ||= 'https://example.test';

const items = [
  { documentId: 'd1', typeKey: 'vehicle_tax', label: '1กก 1234', expiry: '2026-12-15', offsetDays: -30 },
  { documentId: 'd2', typeKey: 'national_id', label: null, expiry: '2026-12-15', offsetDays: -30 },
];

const ACTIONS = {
  vehicle_tax: [
    { kind: 'upsell' as const, label: 'ให้เราต่อให้' },
    { kind: 'link' as const, label: 'ต่อภาษีออนไลน์', url: 'https://eservice.dlt.go.th' },
    { kind: 'location' as const, label: 'ตรอ. ใกล้ฉัน', searchTerm: 'ตรอ. ตรวจสภาพรถ' },
  ],
  national_id: [
    { kind: 'location' as const, label: 'ที่ว่าการอำเภอ', searchTerm: 'ที่ว่าการอำเภอ' },
  ],
};

/** ทุกข้อความที่ builder สร้างได้ รวมไว้ที่เดียว เพื่อตรวจกฎที่ต้องจริงทุกใบ */
function everyMessage(): M.LineMessage[] {
  return [
    ...M.greeting(),
    ...M.confirmExtracted({ documentId: 'd1', typeKey: 'vehicle_tax', label: '1กก 1234', expiry: '2026-12-15', today: '2026-11-15' }),
    ...M.alreadyHave('vehicle_tax', '1กก 1234', '2026-12-15'),
    ...M.alreadyConfirmed('vehicle_tax', '1กก 1234', '2026-12-15'),
    ...M.askRenewalOrNew({ existingId: 'd1', typeKey: 'vehicle_tax', existingLabel: '1กก 1234', existingExpiry: '2026-01-01', newExpiry: '2026-12-15', reason: 'unclear_gap' }),
    ...M.askRenewalOrNew({ existingId: 'd1', typeKey: 'vehicle_tax', existingLabel: null, existingExpiry: '2026-01-01', newExpiry: '2026-12-15', reason: 'no_label' }),
    ...M.askDate({ documentId: 'd1', reason: 'edit' }),
    ...M.askType(),
    ...M.askPhotoFor('vehicle_tax'),
    ...M.correctedDate({ documentId: 'd1', typeKey: 'vehicle_tax', label: '1กก 1234', from: '2026-12-10', to: '2026-12-15', reminderDates: [], today: '2026-11-15' }),
    ...M.renewedFromNewCopy({ documentId: 'd1', typeKey: 'vehicle_tax', label: '1กก 1234', from: '2025-12-15', to: '2026-12-15', reminderDates: [], today: '2026-11-15' }),
    ...M.savedAndSuggestMore({ typeKey: 'vehicle_tax', reminderDates: [{ send_on: '2026-12-01', offset_days: -30 }], docCount: 1, today: '2026-11-15', expiry: '2026-12-15', ownedTypeKeys: [] }),
    ...M.upcomingReminder(items, '2026-11-15', ACTIONS),
    ...M.upcomingReminder([items[0]], '2026-11-15', ACTIONS),
    ...M.dueReminder(items),
    ...M.dueReminder([items[0]]),
    ...M.rolledOver({ documentId: 'd1', typeKey: 'vehicle_tax', label: '1กก 1234', newExpiry: '2027-12-15' }),
    ...M.pickRenewed(items, '2026-11-15'),
    ...M.upsellIntro('vehicle_tax'),
    ...M.nearbyPlaces([{ label: 'ตรอ. ใกล้ฉัน', url: 'https://maps.example/x' }]),
    ...M.notADocument(),
    ...M.confirmDelete(3),
    ...M.deleted(),
    ...M.archived(),
    ...M.toHuman(),
    ...M.listLink('https://liff.line.me/x'),
    ...M.fallback(),
  ];
}

function quickItems(msg: any): any[] {
  return msg?.quickReply?.items ?? [];
}

/**
 * LINE ตอบ 400 ทั้งก้อนถ้าป้ายใน quick reply ยาวเกิน 20 ตัวอักษร
 * และไม่บอกว่าฟิลด์ไหน ผู้ใช้จะเจอความเงียบ เพราะ reply token ถูกใช้ไปแล้ว
 *
 * กฎนี้สำคัญขึ้นมากหลังย้ายปุ่มจาก Flex (จำกัด 40) มาอยู่ที่ quick reply
 */
test('ป้ายในปุ่ม quick reply ต้องไม่ยาวจนถูกตัด', () => {
  // chips() ตัดให้อยู่แล้วเพื่อกัน 400 แต่ป้ายที่โดนตัดคือป้ายที่เราเขียนยาวเกินไปเอง
  // "ที่ว่าการอำเภ…" อ่านแล้วไม่รู้เรื่อง — ต้องแก้ที่ต้นทาง ไม่ใช่ปล่อยให้ตัด
  const clipped: string[] = [];
  for (const msg of everyMessage()) {
    for (const it of quickItems(msg)) {
      const label: string = it.action?.label ?? '';
      assert.ok(label.length <= 20, `${label} ยาว ${label.length} ตัว`);
      if (label.endsWith('…')) clipped.push(label);
    }
  }
  assert.deepEqual(clipped, []);
});

test('ทุกชิปที่ตั้งไอคอนไว้ ต้องได้ URL รูปจริง', () => {
  for (const msg of everyMessage()) {
    for (const it of quickItems(msg)) {
      if (it.imageUrl) {
        assert.match(it.imageUrl, /^https:\/\/.+\/icons\/[a-z]+\.png$/);
      }
    }
  }
});

/** จำนวนชิปสูงสุดของ LINE คือ 13 */
test('ชิปต่อข้อความต้องไม่เกิน 13 ปุ่ม', () => {
  for (const msg of everyMessage()) {
    assert.ok(quickItems(msg).length <= 13);
  }
});

/**
 * ปุ่มทั้งหมดย้ายมาอยู่ที่ quick reply แล้ว
 *
 * ไม่ใช่แค่เรื่องไอคอน — การ์ดเก่าค้างอยู่ในแชทตลอดกาล
 * ผู้ใช้เลื่อนขึ้นไปกดปุ่มของเมื่อเดือนที่แล้วได้ ส่วน quick reply หายไปเอง
 */
test('การ์ด Flex ต้องไม่มีปุ่มเหลืออยู่แล้ว', () => {
  const found: string[] = [];
  const walk = (n: any, path = '$') => {
    if (Array.isArray(n)) return n.forEach((x, i) => walk(x, `${path}[${i}]`));
    if (!n || typeof n !== 'object') return;
    if (n.type === 'button') found.push(`${path} → ${n.action?.label}`);
    for (const [k, v] of Object.entries(n)) if (k !== 'quickReply') walk(v, `${path}.${k}`);
  };
  everyMessage().forEach((m) => walk(m));
  assert.deepEqual(found, []);
});

test('ปุ่ม "ใกล้ฉัน" ต้องค้นหาให้ทันที ไม่ใช่เปิดหน้าเลือกสถานที่เปล่า ๆ', () => {
  const [card] = M.upcomingReminder([items[1]], '2026-11-15', ACTIONS) as any[];
  const uris = quickItems(card).map((i: any) => i.action.uri).filter(Boolean);
  /**
   * ไม่มีพิกัดต้องใช้แบบ ?api=1&query= เท่านั้น
   * แบบใส่คำค้นไว้ใน path เฉย ๆ Google จะเดาให้หนึ่งที่แล้วปักหมุดอันนั้นเลย
   * ซึ่งกลายเป็นสำนักงานคนละจังหวัดที่อยู่ห่างออกไปหลายสิบกิโล
   */
  assert.ok(
    uris.some((u: string) =>
      u.startsWith('https://www.google.com/maps/search/?api=1&query=') &&
      u.includes(encodeURIComponent('ที่ว่าการอำเภอ'))
    ),
    'ไม่มีพิกัด ต้องเป็นลิงก์ค้นหาจริง ไม่ใช่ลิงก์ที่ Google เดาที่ให้'
  );

  // มีพิกัด = ค้นรอบตัวเขา ผลลัพธ์เป็นรายการให้เลือก ไม่ใช่หมุดเดียว
  const [near] = M.upcomingReminder([items[1]], '2026-11-15', ACTIONS, { lat: 13.82, lng: 100.53 }) as any[];
  const nearUris = quickItems(near).map((i: any) => i.action.uri).filter(Boolean);
  assert.ok(nearUris.some((u: string) => u.includes('/@13.82,100.53,')));
  // location action เปิดได้แค่หน้าเลือกสถานที่ของ LINE ซึ่งไม่รับคำค้นของเรา
  assert.ok(!quickItems(card).some((i: any) => i.action.type === 'location'));
});

test('ยังไม่ถึงรอบต่อ ต้องไม่มีปุ่มต่ออายุ', () => {
  // ภาษีรถต่อล่วงหน้าได้ 90 วัน — เหลืออีก 300 วัน ปุ่มพวกนี้กดไปก็เสียเที่ยว
  const far = { ...items[0], expiry: '2027-09-11', offsetDays: -300 };
  const [card] = M.upcomingReminder([far], '2026-11-15', ACTIONS) as any[];
  const labels = quickItems(card).map((i: any) => i.action.label);
  assert.deepEqual(labels, ['ต่อเองแล้ว', 'เอกสารของฉัน']);

  // แต่พอถึงช่วงต่อได้ ปุ่มต้องกลับมาครบ
  const [ok] = M.upcomingReminder([items[0]], '2026-11-15', ACTIONS) as any[];
  assert.equal(quickItems(ok).length, 5);
});

test('ต่อเองแล้ว ต้องบอกรอบเตือนเหมือนตอนบันทึกใบใหม่', () => {
  const [msg] = M.rolledOver({
    documentId: 'd1', typeKey: 'vehicle_tax', label: '1กก 1234', newExpiry: '2027-12-15',
    today: '2026-11-15',
    reminderDates: [
      { send_on: '2027-10-16', offset_days: -60 },
      { send_on: '2027-11-15', offset_days: -30 },
      { send_on: '2027-12-08', offset_days: -7 },
    ],
  }) as any[];
  assert.match(msg.text, /ผมจะเตือนคุณ 3 ครั้ง/);
});

test('มีการ์ดเตือนด่วนต่อท้าย ต้องไม่ชวนคุยเรื่องเอกสารอื่น', () => {
  // ชิปของข้อความสุดท้ายเท่านั้นที่ LINE แสดง — ถ้าแทรกข้อความชวนเพิ่ม ปุ่มของการ์ดเตือนจะหาย
  const withUrgent = M.savedAndSuggestMore({
    typeKey: 'national_id',
    reminderDates: [{ send_on: '2026-11-15', offset_days: -5 }],
    docCount: 1, today: '2026-11-15', expiry: '2026-11-20', ownedTypeKeys: ['national_id'],
  });
  assert.equal(withUrgent.length, 1);

  const normal = M.savedAndSuggestMore({
    typeKey: 'national_id',
    reminderDates: [{ send_on: '2026-12-01', offset_days: -30 }],
    docCount: 1, today: '2026-11-15', expiry: '2026-12-31', ownedTypeKeys: ['national_id'],
  });
  assert.ok(normal.length > 1);
});
