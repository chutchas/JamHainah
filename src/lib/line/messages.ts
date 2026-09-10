/**
 * ข้อความทุกชิ้นที่บอทพูด — อ้างอิงสคริปต์ "บทสนทนาจำให้นะ"
 *
 * กฎการเขียน 6 ข้อ (บังคับกับทุกข้อความที่เพิ่มใหม่):
 *   1. ไม่เกิน 4 บรรทัด
 *   2. ทุกข้อความมีปุ่ม ผู้ใช้ไม่ต้องพิมพ์
 *   3. ผู้ใช้ทักก่อน = reply (ฟรี) · เรายิงเอง = push (฿0.06)
 *   4. รวมหลายเอกสารเป็นข้อความเดียวเสมอ
 *   5. บอกวันที่จริงเสมอ ห้าม "เร็ว ๆ นี้"
 *   6. ไม่มีคำว่า โปรโมชั่น / พิเศษ / ด่วน
 */
import { ASK_TYPE_CHOICES, DocType, SUGGEST_BY_GROUP, displayName, docType } from '@/lib/domain/docTypes';
import { ISODate, formatThai, humanRemaining } from '@/lib/domain/thaiDate';

export type LineMessage = Record<string, unknown>;

const GREEN = '#06C755';
const WARN = '#B8460E';
const MUTED = '#8A9A93';

/* ---------- helpers ---------- */

export function pb(action: string, params: Record<string, string> = {}): string {
  return new URLSearchParams({ a: action, ...params }).toString();
}

function text(t: string, quickReply?: LineMessage): LineMessage {
  return quickReply ? { type: 'text', text: t, quickReply } : { type: 'text', text: t };
}

function chips(items: Array<{ label: string; data?: string; date?: boolean; camera?: boolean }>): LineMessage {
  return {
    items: items.slice(0, 13).map((c) => ({
      type: 'action',
      action: c.camera
        ? { type: 'camera', label: c.label }
        : c.date
        ? {
            type: 'datetimepicker', label: c.label, data: c.data ?? pb('date'),
            mode: 'date', initial: undefined,
          }
        : { type: 'postback', label: c.label, data: c.data!, displayText: c.label },
    })),
  };
}

/**
 * LINE ปฏิเสธ text ที่เป็นสตริงว่างด้วย 400 "message is invalid"
 * และไม่บอกว่าฟิลด์ไหน — เสียเวลาไล่หานาน
 * ตรงนี้จึงกันไว้ที่ต้นทาง: ไม่มี label ก็ไม่ต้องมีคอลัมน์ซ้าย
 */
function row(label: string, value: string, hot = false): LineMessage {
  const right: LineMessage = {
    type: 'text', text: value || '-', size: 'sm',
    weight: hot ? 'bold' : 'regular',
    color: hot ? WARN : undefined,
    align: 'end', flex: 4, wrap: true,
  };
  if (!label) {
    return { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [right] };
  }
  return {
    type: 'box', layout: 'horizontal', spacing: 'sm',
    contents: [
      { type: 'text', text: label, size: 'sm', color: MUTED, flex: 3 },
      right,
    ],
  };
}

function bubble(body: LineMessage[], footer?: LineMessage[], altText = 'จำให้นะ'): LineMessage {
  const contents: Record<string, unknown> = {
    type: 'bubble',
    body: { type: 'box', layout: 'vertical', spacing: 'md', contents: body },
  };
  if (footer?.length) {
    contents.footer = { type: 'box', layout: 'vertical', spacing: 'sm', contents: footer };
  }
  return { type: 'flex', altText, contents };
}

function button(label: string, data: string, style: 'primary' | 'secondary' | 'link' = 'link'): LineMessage {
  return {
    type: 'button', style, height: 'sm',
    color: style === 'primary' ? GREEN : undefined,
    action: { type: 'postback', label, data, displayText: label },
  };
}

/* ============================================================
 * ฉาก 01 — กด Add เพื่อน
 * เป้าหมายเดียว: ให้เขาส่งรูปภายใน 60 วินาที
 * ห้ามมี เงื่อนไขการใช้บริการ / ราคา / การสมัคร ตรงนี้
 * ============================================================ */
export function greeting(): LineMessage[] {
  return [
    text(
      'สวัสดีครับ 👋\n' +
        'ต่อไปนี้ผมจำวันหมดอายุเอกสารให้เอง\n' +
        'ภาษีรถ · พ.ร.บ. · ใบขับขี่ · ประกัน · พาสปอร์ต\n\n' +
        'ถ่ายรูปเอกสารส่งมาได้เลย\n' +
        'ไม่ต้องสมัคร ไม่ต้องกรอกอะไรครับ',
      chips([
        { label: '📸 ส่งรูปเอกสาร', camera: true },
        { label: '📅 พิมพ์วันที่เอง', data: pb('manual') },
      ])
    ),
  ];
}

/* ============================================================
 * ฉาก 02 — อ่านรูปได้ ให้คนยืนยัน
 * ปุ่ม "ถูกต้อง" คือหัวใจของสินค้าทั้งตัว:
 *   ความแม่นยำเป็น 100% ทันที และทุกครั้งที่กด "แก้ไข"
 *   เราได้ตัวอย่างที่โมเดลอ่านพลาดพร้อมเฉลย
 * ============================================================ */
export function confirmExtracted(args: {
  documentId: string;
  typeKey: string;
  label?: string | null;
  expiry: ISODate;
  today: ISODate;
}): LineMessage[] {
  const t = docType(args.typeKey);
  const rows: LineMessage[] = [];
  if (args.label) rows.push(row('เลขที่/ทะเบียน', args.label));
  rows.push(row('หมดอายุ', formatThai(args.expiry)));
  rows.push(row('เหลืออีก', humanRemaining(args.today, args.expiry), true));

  return [
    text('อ่านได้แบบนี้ครับ ถูกต้องไหม'),
    bubble(
      [
        { type: 'text', text: `${t.emoji} ${t.label}`, weight: 'bold', size: 'lg', wrap: true },
        { type: 'separator', margin: 'md' },
        { type: 'box', layout: 'vertical', spacing: 'sm', margin: 'md', contents: rows },
      ],
      [
        button('✅ ถูกต้อง', pb('confirm', { d: args.documentId }), 'primary'),
        button('✏️ แก้ไขวันที่', pb('edit', { d: args.documentId })),
      ],
      `${t.label} หมดอายุ ${formatThai(args.expiry)}`
    ),
  ];
}

/** ส่งใบเดิมซ้ำ — บอกตรง ๆ ดีกว่าเพิ่มซ้ำเงียบ ๆ */
export function alreadyHave(typeKey: string, label: string | null | undefined, expiry: ISODate): LineMessage[] {
  return [
    text(
      `${displayName(typeKey, label)} มีอยู่ในรายการแล้วครับ\nหมดอายุ ${formatThai(expiry)}\n\nผมจะไม่บันทึกซ้ำนะครับ`,
      chips([
        { label: '📋 ดูรายการทั้งหมด', data: pb('list') },
        { label: '📸 เพิ่มใบอื่น', camera: true },
      ])
    ),
  ];
}

/**
 * ใบเดิมแต่วันหมดอายุใหม่ = เขาต่ออายุมาแล้ว
 *
 * นี่คือสัญญาณที่มีค่าที่สุดในระบบ — เอกสารต่ออายุตัวเองโดยที่ผู้ใช้
 * ไม่ต้องทำอะไรเลยนอกจากถ่ายรูปใบใหม่
 */
export function renewedFromNewCopy(args: {
  typeKey: string;
  label?: string | null;
  from: ISODate;
  to: ISODate;
  reminderDates: Array<{ send_on: ISODate; offset_days: number }>;
}): LineMessage[] {
  const next = args.reminderDates.find((r) => r.offset_days < 0);
  return [
    text(
      `ต่ออายุแล้วนี่เอง ✅\n${displayName(args.typeKey, args.label)}\n\n` +
        `${formatThai(args.from)} → ${formatThai(args.to)}\n\n` +
        (next ? `ครั้งต่อไปผมจะเตือน ${formatThai(next.send_on)} ครับ` : 'ผมอัปเดตให้แล้วครับ'),
      chips([{ label: '📋 ดูรายการทั้งหมด', data: pb('list') }])
    ),
  ];
}

/** ขยับไม่กี่วัน = ครั้งก่อนอ่านผิด ไม่ใช่ต่ออายุ (ห้ามนับเป็น renewed_count) */
export function correctedDate(args: {
  typeKey: string;
  label?: string | null;
  from: ISODate;
  to: ISODate;
  reminderDates: Array<{ send_on: ISODate; offset_days: number }>;
}): LineMessage[] {
  const next = args.reminderDates.find((r) => r.offset_days < 0);
  return [
    text(
      `ครั้งก่อนผมอ่านผิดไปนิดครับ 🙏\n${displayName(args.typeKey, args.label)}\n\n` +
        `แก้จาก ${formatThai(args.from)}\nเป็น ${formatThai(args.to)} ให้แล้ว\n\n` +
        (next ? `ครั้งต่อไปผมจะเตือน ${formatThai(next.send_on)} ครับ` : ''),
      chips([{ label: '📋 ดูรายการทั้งหมด', data: pb('list') }])
    ),
  ];
}

/**
 * มีใบของประเภทนี้อยู่แล้ว แต่ไม่มีเลขให้เทียบ วันก็ไม่ตรง
 * เดาไม่ได้ว่าต่ออายุหรือคนละคัน — ต้องถาม
 *
 * เดาผิดฝั่งไหนก็เสียหาย: ทับใบเดิม = ข้อมูลรถอีกคันหาย
 * สร้างใบใหม่ = โดนเตือนด้วยวันที่ผ่านไปแล้วตลอดไป
 */
export function askRenewalOrNew(args: {
  typeKey: string;
  existingId: string;
  existingLabel?: string | null;
  existingExpiry: ISODate;
  newExpiry: ISODate;
  reason?: 'no_label' | 'unclear_gap';
}): LineMessage[] {
  const head =
    `ผมมี ${displayName(args.typeKey, args.existingLabel)} อยู่แล้ว 1 ใบ\n` +
    `หมดอายุ ${formatThai(args.existingExpiry)}\n\n` +
    `ใบที่เพิ่งส่งมาหมดอายุ ${formatThai(args.newExpiry)}\n`;

  // ห่างกันแปลก ๆ — ไม่ใกล้พอจะเป็นคำผิด ไม่ไกลพอจะเป็นรอบใหม่
  if (args.reason === 'unclear_gap') {
    return [
      text(head + 'อันไหนถูกครับ', chips([
        { label: '🔄 ต่ออายุแล้ว ใช้วันใหม่', data: pb('renew_existing', { d: args.existingId }) },
        { label: '✏️ ครั้งก่อนอ่านผิด แก้เป็นวันใหม่', data: pb('fix_date', { d: args.existingId }) },
        { label: '➕ คนละใบ', data: pb('as_new') },
      ])),
    ];
  }

  return [
    text(head + 'ใบนี้คืออันไหนครับ', chips([
      { label: '🔄 ต่ออายุใบเดิม', data: pb('renew_existing', { d: args.existingId }) },
      { label: '➕ คนละใบ/คนละคัน', data: pb('as_new') },
    ])),
  ];
}

/* ============================================================
 * ฉาก 02b — อ่านไม่ออก
 * ห้ามให้ผู้ใช้พิมพ์วันที่เป็นข้อความเด็ดขาด — ใช้ datetimepicker เท่านั้น
 * คนไทยเขียนวันที่ได้ไม่ต่ำกว่า 8 แบบ และสลับ พ.ศ./ค.ศ. ตลอด
 * ============================================================ */
export function askDate(args: { typeKey?: string; documentId?: string; reason?: 'ocr_miss' | 'edit' | 'manual' }): LineMessage[] {
  const body =
    args.reason === 'edit'
      ? 'ได้ครับ เอกสารนี้หมดอายุวันไหนครับ'
      : args.reason === 'manual'
      ? 'ได้ครับ เอกสารนี้หมดอายุวันไหนครับ'
      : 'รูปไม่ค่อยชัดครับ 😅\nไม่เป็นไร บอกผมตรง ๆ ก็ได้\n\nเอกสารนี้หมดอายุวันไหนครับ';

  const data = pb('setdate', {
    ...(args.documentId ? { d: args.documentId } : {}),
    ...(args.typeKey ? { k: args.typeKey } : {}),
  });

  return [
    text(body, chips([
      { label: '📅 เลือกวันที่', data, date: true },
      { label: '📸 ถ่ายใหม่', camera: true },
    ])),
  ];
}

/**
 * ถามประเภทเอกสาร — ใช้เมื่อ OCR อ่านวันที่ได้แต่ไม่รู้ว่าเอกสารอะไร
 *
 * สำคัญ: ต้องบอกด้วยว่าเราอ่านอะไรได้แล้วบ้าง
 * ไม่งั้นผู้ใช้จะรู้สึกว่าที่ส่งรูปไปเมื่อกี้สูญเปล่า
 * และห้ามขึ้นหัวการ์ดว่า "อื่น ๆ" ทั้งที่ยังไม่ได้ถาม — นั่นคือการเดา
 */
export function askType(ctx?: { expiry?: string | null; label?: string | null }): LineMessage[] {
  const opts: DocType[] = ASK_TYPE_CHOICES.map(docType);
  const known: string[] = [];
  if (ctx?.label) known.push(`ในเอกสารเขียนว่า "${ctx.label}"`);
  if (ctx?.expiry) known.push(`หมดอายุ ${formatThai(ctx.expiry)}`);

  const body = known.length
    ? `ผมอ่านได้แค่นี้ครับ\n${known.join('\n')}\n\nแต่ไม่แน่ใจว่าเป็นเอกสารอะไร บอกผมหน่อยครับ`
    : 'เอกสารนี้เป็นประเภทไหนครับ บอกผมหน่อย';

  return [
    text(body, chips(opts.map((t) => ({ label: `${t.emoji} ${t.label}`, data: pb('type', { k: t.key }) })))),
  ];
}

/* ============================================================
 * ฉาก 03 — ยืนยันแล้ว ประกาศสัญญาเป็นตัวเลข แล้วดันใบที่ 2
 *
 * "ผมจะเตือนคุณ N ครั้ง" + วันที่จริง คือข้อความที่ทำให้เขาไม่บล็อก
 * เขาเห็นสัญญาที่ตรวจสอบได้ ไม่ใช่คำโฆษณา
 * ============================================================ */
export function savedAndSuggestMore(args: {
  typeKey: string;
  reminderDates: Array<{ send_on: ISODate; offset_days: number }>;
  docCount: number;
}): LineMessage[] {
  const upcoming = args.reminderDates.filter((r) => r.offset_days < 0);
  const lines = upcoming.map((r) => {
    const when =
      r.offset_days <= -60 ? 'วันแรกที่ต่อได้'
      : `เหลือ ${Math.abs(r.offset_days)} วัน`;
    return `📅 ${formatThai(r.send_on)} — ${when}`;
  });

  const head =
    upcoming.length > 0
      ? `บันทึกแล้วครับ ✅\n\nผมจะเตือนคุณ ${upcoming.length} ครั้ง\n${lines.join('\n')}\n\nลืมได้เลยครับ ผมจำให้แล้ว`
      : 'บันทึกแล้วครับ ✅\nผมจะเตือนเมื่อใกล้ครบกำหนดครับ';

  const out: LineMessage[] = [text(head)];

  if (args.docCount >= 3) {
    // ฉาก 04 — สัญญาว่าจะเงียบ
    const next = upcoming[0];
    out.push(
      text(
        `เยี่ยมครับ ตอนนี้ผมดูให้ ${args.docCount} รายการ 🎉\n\n` +
          (next ? `ครั้งต่อไปที่คุณจะได้ยินจากผม\nคือ ${formatThai(next.send_on)}\n\n` : '') +
          'ระหว่างนี้ผมจะเงียบครับ 🤫',
        chips([{ label: '📋 ดูรายการทั้งหมด', data: pb('list') }])
      )
    );
  } else {
    // ชวนเพิ่มให้เข้ากับสิ่งที่เพิ่งบันทึก — บันทึกบัตรประชาชนแล้วพูดเรื่องรถ คนจะงง
    const group = SUGGEST_BY_GROUP[docType(args.typeKey).group];
    const suggest = group.keys.filter((k) => k !== args.typeKey).slice(0, 3).map(docType);
    out.push(
      text(
        group.prompt,
        chips([
          ...suggest.map((t) => ({ label: `${t.emoji} ${t.label}`, data: pb('type', { k: t.key }) })),
          { label: 'ยังก่อน', data: pb('later') },
        ])
      )
    );
  }
  return out;
}

/* ============================================================
 * ฉาก 06 / 07 — การเตือนล่วงหน้า (PUSH)
 *
 * กฎข้อ 4 บังคับที่นี่: รับ items เป็น "รายการ" เสมอ ไม่ใช่ทีละใบ
 * ถ้าภาษีรถกับ พ.ร.บ. หมดวันเดียวกัน ต้องเป็นข้อความเดียว
 * ============================================================ */
export interface ReminderItem {
  documentId: string;
  typeKey: string;
  label?: string | null;
  expiry: ISODate;
  offsetDays: number;
}

export function upcomingReminder(items: ReminderItem[], today: ISODate): LineMessage[] {
  if (items.length === 0) return [];

  const soonest = items.reduce((a, b) => (a.expiry <= b.expiry ? a : b));
  const t = docType(soonest.typeKey);
  const early = soonest.offsetDays <= -60;
  const urgent = soonest.offsetDays > -14;

  const header = early
    ? `${t.emoji} ${t.label}${soonest.label ? ` ${soonest.label}` : ''}\nต่อได้ตั้งแต่วันนี้แล้วครับ`
    : `${urgent ? '⚠️' : '🔔'} ${items.length > 1 ? 'มี ' + items.length + ' รายการใกล้ครบกำหนด' : displayName(soonest.typeKey, soonest.label)}`;

  const rows = items.map((it) => ({
    type: 'box', layout: 'vertical', spacing: 'xs',
    contents: [
      { type: 'text', text: displayName(it.typeKey, it.label), size: 'sm', weight: 'bold', wrap: true },
      {
        type: 'box', layout: 'horizontal',
        contents: [
          { type: 'text', text: formatThai(it.expiry), size: 'xs', color: MUTED, flex: 3 },
          { type: 'text', text: humanRemaining(today, it.expiry), size: 'xs',
            color: it.offsetDays > -14 ? WARN : MUTED, align: 'end', flex: 2 },
        ],
      },
    ],
  })) as LineMessage[];

  const upsellType = items.map((i) => docType(i.typeKey)).find((t2) => t2.tier === 1 && t2.upsell);
  const footer: LineMessage[] = [];
  if (upsellType?.upsell) {
    const priceSuffix = upsellType.upsell.price ? ` · ${upsellType.upsell.price}฿` : '';
    footer.push(button(`🛵 ${upsellType.upsell.label}${priceSuffix}`, pb('upsell', { d: soonest.documentId }), 'primary'));
  }
  footer.push(button('✅ ต่อเองแล้ว', pb('renewed', { d: soonest.documentId })));
  if (items.length > 1) footer.push(button('📋 ดูทั้งหมด', pb('list')));

  return [
    bubble(
      [
        { type: 'text', text: header, weight: 'bold', size: 'md', wrap: true },
        ...(early && t.renewWindowDays
          ? [{ type: 'text', text: 'ต่อตอนนี้ไม่มีค่าปรับ และไม่ต้องรีบ', size: 'xs', color: MUTED, wrap: true }]
          : []),
        { type: 'separator', margin: 'md' },
        { type: 'box', layout: 'vertical', spacing: 'md', margin: 'md', contents: rows },
      ],
      footer,
      `เตือน: ${displayName(soonest.typeKey, soonest.label)} ${humanRemaining(today, soonest.expiry)}`
    ),
  ];
}

/* ============================================================
 * ฉาก 08 — D+1 วงจรที่ทำให้ข้อมูลสดเอง
 *
 * ฉากนี้คือสิ่งที่ทำให้ฐานข้อมูลไม่ตายภายในหนึ่งรอบปี
 * ผู้ใช้กดปุ่มเดียว เอกสารต่ออายุตัวเองในระบบ
 * ============================================================ */
export function dueReminder(items: ReminderItem[]): LineMessage[] {
  if (items.length === 0) return [];
  const first = items[0];

  if (items.length === 1) {
    return [
      text(
        `${displayName(first.typeKey, first.label)} ครบกำหนดเมื่อวานครับ\nต่อเรียบร้อยหรือยังครับ`,
        chips([
          { label: '✅ ต่อแล้ว', data: pb('renewed', { d: first.documentId }) },
          { label: 'ยังเลย ช่วยที', data: pb('upsell', { d: first.documentId }) },
          { label: 'ไม่ได้ใช้แล้ว', data: pb('archive', { d: first.documentId }) },
        ])
      ),
    ];
  }

  const rows = items.slice(0, 4).map((it) => ({
    type: 'box', layout: 'vertical', spacing: 'xs', margin: 'md',
    contents: [
      { type: 'text', text: displayName(it.typeKey, it.label), size: 'sm', weight: 'bold', wrap: true },
      { type: 'text', text: `ครบกำหนด ${formatThai(it.expiry)}`, size: 'xs', color: MUTED },
      button('✅ ต่อแล้ว', pb('renewed', { d: it.documentId })),
    ],
  })) as LineMessage[];

  return [
    bubble(
      [
        { type: 'text', text: `มี ${items.length} รายการครบกำหนดแล้วครับ`, weight: 'bold', size: 'md', wrap: true },
        { type: 'text', text: 'ต่อเรียบร้อยหรือยังครับ', size: 'sm', color: MUTED },
        { type: 'separator', margin: 'md' },
        ...rows,
      ],
      items.length > 4 ? [button('📋 ดูทั้งหมด', pb('list'))] : undefined,
      'มีเอกสารครบกำหนดแล้ว'
    ),
  ];
}

/** ตอบหลังกด "ต่อแล้ว" — เจอกันอีกทีปีหน้า */
export function rolledOver(typeKey: string, label: string | null | undefined, newExpiry: ISODate): LineMessage[] {
  return [
    text(
      `เยี่ยมครับ ✅\nผมเลื่อนไปเป็น ${formatThai(newExpiry)} ให้แล้ว\n\nเจอกันอีกทีครับ 👋`
    ),
  ];
}

/* ============================================================
 * ฉาก 09 — ให้เราต่อให้
 * v1 ทำมือ 20 เคสแรก ไม่ต้องมีระบบ
 * ============================================================ */
export function upsellIntro(typeKey: string): LineMessage[] {
  const t = docType(typeKey);
  const price = t.upsell?.price;
  return [
    text(
      'ยินดีครับ 🛵\nขอ 3 อย่างนี้ครับ\n\n' +
        '1. รูปเล่มทะเบียน หน้าที่มีเลขตัวถัง\n' +
        '2. ที่อยู่จัดส่งป้ายภาษี\n' +
        '3. เบอร์โทรติดต่อ\n\n' +
        (price ? `ค่าบริการ ${price} บาท\n(ค่าภาษีจริงแจ้งอีกทีหลังคำนวณ)\n` : '') +
        'เสร็จภายใน 3 วันทำการ',
      chips([
        { label: '📤 ส่งข้อมูล', data: pb('upsell_start', { k: typeKey }) },
        { label: '💬 ขอถามก่อน', data: pb('human') },
      ])
    ),
  ];
}

/* ============================================================
 * ฉาก 11 — กรณีขอบ
 * ============================================================ */
export function notADocument(): LineMessage[] {
  return [
    text(
      'อันนี้ผมอ่านไม่ออกครับ 😅\nส่งรูปเอกสารที่มีวันหมดอายุมาได้เลย',
      chips([
        { label: '📸 ถ่ายใหม่', camera: true },
        { label: '📅 พิมพ์วันที่เอง', data: pb('manual') },
      ])
    ),
  ];
}

export function confirmDelete(docCount: number): LineMessage[] {
  return [
    text(
      `ได้ครับ ผมจะลบเอกสารทั้ง ${docCount} รายการ\nและรูปที่เคยส่งมาทั้งหมดถาวร\n\nยืนยันไหมครับ`,
      chips([
        { label: 'ยืนยันลบ', data: pb('delete_confirm') },
        { label: 'ยกเลิก', data: pb('cancel') },
      ])
    ),
  ];
}

export function deleted(): LineMessage[] {
  return [text('ลบข้อมูลทั้งหมดเรียบร้อยแล้วครับ\nขอบคุณที่เคยให้ผมดูแลนะครับ 🙏')];
}

export function archived(): LineMessage[] {
  return [text('รับทราบครับ ผมจะไม่เตือนรายการนี้อีก ✅')];
}

export function toHuman(): LineMessage[] {
  return [text('ผมส่งข้อความให้ทีมงานแล้วครับ\nเดี๋ยวมีคนตอบกลับมานะครับ 🙏')];
}

/** ปุ่มเปิด LIFF — ใช้ใน rich menu เป็นหลัก */
export function listLink(liffUrl: string): LineMessage[] {
  return [
    {
      type: 'text',
      text: 'เปิดดูรายการทั้งหมดได้ที่นี่ครับ',
      quickReply: {
        items: [{ type: 'action', action: { type: 'uri', label: '📋 รายการของฉัน', uri: liffUrl } }],
      },
    },
  ];
}

export function fallback(): LineMessage[] {
  return [
    text(
      'ผมช่วยจำวันหมดอายุเอกสารให้ครับ\nส่งรูปเอกสารมาได้เลย',
      chips([
        { label: '📸 ส่งรูปเอกสาร', camera: true },
        { label: '📋 รายการของฉัน', data: pb('list') },
        { label: '💬 คุยกับคน', data: pb('human') },
      ])
    ),
  ];
}
