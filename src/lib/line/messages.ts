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
import { ASK_TYPE_CHOICES, DocType, SUGGEST_BY_GROUP, displayName, plainName, docType } from '@/lib/domain/docTypes';
import { ISODate, daysBetween, formatThai, humanRemaining } from '@/lib/domain/thaiDate';
import { env } from '@/lib/env';
import { RenewAction, mapsSearchUrl, renewWindow } from '@/lib/domain/renewActions';

export type LineMessage = Record<string, unknown>;

const WARN = '#B8460E';
const MUTED = '#8A9A93';
/** เขียวอมฟ้าเข้ม — ตัวเดียวกับต้นไล่สีของไอคอนและตัวอักษรบน rich menu */
const TEAL = '#0B8A72';
/** พื้นการ์ด เขียวจาง ๆ ให้เข้าโทนเดียวกับปกและพื้นหลัง rich menu */
const CARD_BG = '#F5FBF8';

/**
 * รูปในโปรเจกต์ — ไม่มี NEXT_PUBLIC_BASE_URL ก็คืน null
 *
 * ทุกที่ที่เรียกต้องรับ null ได้ แล้วข้ามรูปนั้นไป
 * การ์ดที่ไม่มีรูปยังอ่านรู้เรื่อง แต่บอทที่เงียบเพราะรูปไม่ขึ้นคือของเสีย
 */
function asset(path: string): string | null {
  return env.baseUrl ? `${env.baseUrl}/${path}` : null;
}
const mascot = (name: string) => asset(`mascot/${name}.png`);
/** ไอคอนประเภทเอกสาร — เส้นสีเดียวกับไอคอนปุ่ม แทน emoji ของระบบที่สีจัดจนแย่งสายตา */
const docIcon = (typeKey: string) => asset(`icons/doc/${typeKey}.png`);

/**
 * ชื่อเอกสารกับไอคอนของมัน — ไอคอนอยู่ขวาสุด
 *
 * ซ้ายของแถวมีมาสคอตหรือข้อความอยู่แล้ว วางไอคอนไว้ซ้ายด้วยจะเบียดกัน
 * ขวาสุดเป็นที่ว่างที่ตายังกวาดไปถึงตอนอ่านชื่อจบพอดี
 */
function docRow(typeKey: string, label?: string | null, size: 'sm' | 'md' = 'md'): LineMessage {
  const name: LineMessage = {
    type: 'text', text: plainName(typeKey, label), weight: 'bold', size, wrap: true, flex: 1,
  };
  const url = docIcon(typeKey);
  if (!url) return name;
  return {
    type: 'box', layout: 'horizontal', spacing: 'sm', alignItems: 'center',
    // ขนาดเป็น px ไม่ใช่คีย์เวิร์ด — xxs ของ LINE คือ 40px ซึ่งใหญ่เกินตัวหนังสือ 13px ไปมาก
    contents: [name, { type: 'image', url, size: size === 'sm' ? '26px' : '34px', aspectMode: 'fit', flex: 0 }],
  };
}

/**
 * ชื่อเดียวของหน้ารายการ
 *
 * เคยมีสามชื่อสำหรับที่เดียวกัน — "ดูรายการทั้งหมด" "รายการของฉัน" "ดูทั้งหมด"
 * ผู้ใช้ต้องมานั่งเดาว่าสามปุ่มนี้พาไปที่เดียวกันไหม
 * และ "รายการ" ในภาษาไทยกว้างเกินไป ("เอกสาร" บอกตรง ๆ ว่าข้างในมีอะไร)
 * ชื่อนี้ตรงกับหัวข้อบนหน้าเว็บด้วย กดแล้วจะได้รู้ทันทีว่ามาถูกที่
 */
const LIST_NAME = 'เอกสารของฉัน';

/**
 * ชุดไอคอน — เราวาดเอง ไม่ใช้ emoji
 *
 * emoji ถูกวาดโดยระบบปฏิบัติการ ไม่ใช่โดยเรา ไอคอนเดียวกันจึงหน้าตาคนละอย่าง
 * ระหว่าง iPhone กับ Android และบางตัวกลายเป็นกล่องสีเทาบนเครื่องเก่า
 * ไฟล์จริงอยู่ที่ public/icons (สร้างจาก tools/icons.py)
 *
 * ใช้ได้เฉพาะใน quick reply — Flex button ใส่รูปไม่ได้
 * ซึ่งเป็นหนึ่งในเหตุผลที่ปุ่มทั้งหมดย้ายมาอยู่ที่ quick reply
 */
const ICONS = [
  'doc', 'camera', 'calendar', 'check', 'edit', 'renew',
  'plus', 'pin', 'globe', 'chat', 'spark', 'bell', 'box', 'close',
] as const;
export type IconName = (typeof ICONS)[number];

/* ---------- helpers ---------- */

export function pb(action: string, params: Record<string, string> = {}): string {
  return new URLSearchParams({ a: action, ...params }).toString();
}

function text(t: string, quickReply?: LineMessage): LineMessage {
  return quickReply ? { type: 'text', text: t, quickReply } : { type: 'text', text: t };
}

export interface Chip {
  label: string;
  /** postback */
  data?: string;
  /** เปิดลิงก์ */
  uri?: string;
  /** เปิดปฏิทิน */
  date?: boolean;
  /** วันที่ตั้งต้นในปฏิทิน */
  initial?: string;
  /** เปิดกล้อง */
  camera?: boolean;
  /** เปิดหน้าเอกสารของฉัน */
  liff?: boolean;
  /** ขอตำแหน่ง */
  locate?: boolean;
  icon?: IconName;
  /** รูปจาก URL ตรง ๆ — ใช้กับไอคอนประเภทเอกสารที่ไม่ได้อยู่ในชุด IconName */
  imageUrl?: string | null;
}

/**
 * LINE ตัดข้อความที่ยาวเกิน 20 ตัวอักษรใน quick reply ทิ้งไม่ได้ — มันตอบ 400 ทั้งก้อน
 * แล้วผู้ใช้จะเจอความเงียบ เพราะ reply token ถูกใช้ไปแล้ว
 * ป้ายที่สั้นลงหนึ่งคำ ดีกว่าข้อความที่ส่งไม่ออก
 */
function clip(label: string): string {
  return label.length <= 20 ? label : label.slice(0, 19) + '…';
}

/** ป้ายในฐานข้อมูลยังมี emoji นำหน้าอยู่ — ตอนนี้มีไอคอนจริงแล้ว เอาออก */
function bare(label: string): string {
  return label.replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

function chips(items: Chip[]): LineMessage {
  return {
    items: items.slice(0, 13).map((c) => {
      const label = clip(bare(c.label));
      const action = c.locate
        ? { type: 'location', label }
        : c.liff
        // uri action เปิด LIFF ทันทีที่กด — ไม่ต้องวิ่งเข้าเซิร์ฟเวอร์
        // ไม่เสียค่าข้อความ และผู้ใช้กดครั้งเดียวจบ
        ? { type: 'uri', label, uri: env.liffUrl }
        : c.uri
        ? { type: 'uri', label, uri: c.uri }
        : c.camera
        ? { type: 'camera', label }
        : c.date
        ? { type: 'datetimepicker', label, data: c.data ?? pb('date'), mode: 'date', initial: c.initial }
        : { type: 'postback', label, data: c.data!, displayText: label };

      const item: Record<string, unknown> = { type: 'action', action };
      // ไม่มี baseUrl ก็แค่ไม่มีไอคอน ปุ่มยังกดได้ — ห้ามพังเพราะเรื่องรูป
      if (c.imageUrl) item.imageUrl = c.imageUrl;
      else if (c.icon && env.baseUrl) item.imageUrl = `${env.baseUrl}/icons/${c.icon}.png`;
      return item;
    }),
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

function bubble(
  body: LineMessage[],
  footer?: LineMessage[],
  altText = 'จำให้นะ',
  hero?: string | null
): LineMessage {
  const contents: Record<string, unknown> = {
    type: 'bubble',
    body: { type: 'box', layout: 'vertical', spacing: 'md', contents: body },
    // พื้นการ์ดสีเดียวกับโทนของปกและ rich menu — แชทกับหน้าเว็บจะได้เป็นที่เดียวกัน
    styles: { body: { backgroundColor: CARD_BG } },
  };
  if (hero) {
    contents.hero = { type: 'image', url: hero, size: 'full', aspectRatio: '20:9', aspectMode: 'cover' };
  }
  if (footer?.length) {
    contents.footer = {
      type: 'box', layout: 'vertical', spacing: 'sm', contents: footer,
      backgroundColor: CARD_BG,
    };
  }
  return { type: 'flex', altText, contents };
}

/** การ์ดเปล่า ๆ ที่มีแต่เนื้อ — ปุ่มทั้งหมดอยู่ที่ quick reply อยู่แล้ว */
function flexCard(body: LineMessage[], altText: string): LineMessage {
  return bubble(body, undefined, altText);
}

/**
 * หัวการ์ด: มาสคอตยืนอยู่ข้างชื่อเรื่อง
 *
 * เลือกท่าให้ตรงกับสิ่งที่การ์ดกำลังบอก ไม่ใช่หยิบตัวไหนก็ได้มาแปะให้ดูน่ารัก
 * มาสคอตที่ท่าไม่ตรงกับเนื้อหา คือสัญญาณรบกวนที่ผู้ใช้ต้องเรียนรู้ที่จะมองข้าม
 */
function headRow(title: string, pose: string, size: 'md' | 'lg' = 'md'): LineMessage {
  const label: LineMessage = {
    type: 'text', text: title, weight: 'bold', size, wrap: true, color: TEAL, flex: 1, gravity: 'center',
  };
  const url = mascot(pose);
  if (!url) return label;
  return {
    type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center',
    contents: [{ type: 'image', url, size: size === 'lg' ? '64px' : '52px', aspectMode: 'fit', flex: 0 }, label],
  };
}


/* ============================================================
 * ฉาก 01 — กด Add เพื่อน
 * เป้าหมายเดียว: ให้เขาส่งรูปภายใน 60 วินาที
 * ห้ามมี เงื่อนไขการใช้บริการ / ราคา / การสมัคร ตรงนี้
 * ============================================================ */
/**
 * การ์ดต้อนรับ — ข้อความแรกที่เขาเห็นหลังกด Add เพื่อน
 *
 * ใช้การ์ดแทนข้อความเปล่า เพราะนี่คือจังหวะเดียวที่เราได้พิสูจน์ว่า
 * นี่ไม่ใช่บอทสแปมที่เขาเผลอกดตาม การ์ดที่มีปกกับมาสคอตบอกเรื่องนั้นได้ใน 1 วินาที
 * เร็วกว่าที่เขาจะอ่านบรรทัดแรกจบ
 */
function welcome(): LineMessage {
  const card = bubble(
    [
      headRow('สวัสดีครับ 👋', '16-wai', 'lg'),
      { type: 'text', text: 'ต่อไปนี้ผมจำวันหมดอายุเอกสารให้เอง', size: 'sm', wrap: true, color: MUTED },
      { type: 'separator', margin: 'md' },
      {
        type: 'box', layout: 'vertical', spacing: 'sm', margin: 'md',
        contents: [
          { type: 'text', text: 'ภาษีรถ · พ.ร.บ. · ใบขับขี่\nประกัน · พาสปอร์ต · บัตรประชาชน', size: 'sm', wrap: true },
          { type: 'separator', margin: 'md' },
          { type: 'text', text: 'ถ่ายรูปเอกสารส่งมาได้เลย', size: 'sm', wrap: true, margin: 'md', weight: 'bold' },
          { type: 'text', text: 'หรือพิมพ์บอกก็ได้ครับ เช่น\n"พ.ร.บ. หมดอายุ 30/6/69"', size: 'sm', wrap: true, color: MUTED },
          { type: 'text', text: 'ไม่ต้องสมัคร ไม่ต้องกรอกอะไรครับ', size: 'xs', wrap: true, color: MUTED, margin: 'md' },
        ],
      },
    ],
    undefined,
    'จำให้นะ — ผมจำวันหมดอายุเอกสารให้เอง',
    asset('brand/flex-hero.jpg')
  );
  card.quickReply = chips([{ label: 'ส่งรูปเอกสาร', camera: true, icon: 'camera' }]);
  return card;
}

export function greeting(): LineMessage[] {
  return [
    /**
     * บอกวิธีใช้ทั้งสองทางตรงนี้ทีเดียว แล้วเหลือปุ่มเดียว
     *
     * "พิมพ์วันที่เอง" เคยเป็นปุ่มที่พาไปทางยาวที่สุดในระบบ
     * กด → เลือกประเภท → เปิดปฏิทิน → เลื่อนหาปี → กดยืนยัน
     * ห้าจังหวะ เพื่อบอกเรื่องที่พูดจบในประโยคเดียว
     *
     * ตอนนี้พิมพ์มาได้เลยโดยไม่ต้องกดอะไรก่อน ปุ่มนั้นจึงไม่มีเหตุผลให้อยู่ต่อ
     * และประโยคตัวอย่างสอนได้ดีกว่าปุ่ม เพราะมันบอกด้วยว่าพิมพ์ยังไง
     */
    welcome(),
  ];
}

/* ============================================================
 * ฉาก 02 — อ่านรูปได้ ให้คนยืนยัน
 *
 * เอกสารถูกบันทึกและตั้งเตือนไปแล้วก่อนการ์ดนี้ถึงมือเขา
 * ปุ่ม "ถูกต้อง" จึงไม่ใช่เงื่อนไขให้ระบบทำงาน — ไม่กดก็เตือน
 * แต่เป็นที่เดียวที่เราวัดได้ว่าโมเดลอ่านแม่นแค่ไหน
 * และทุกครั้งที่กด "แก้ไขวันที่" เราได้เคสที่อ่านพลาดพร้อมเฉลย
 * ============================================================ */
export interface ExtractedDoc {
  documentId: string;
  typeKey: string;
  label?: string | null;
  expiry: ISODate;
}

/**
 * เนื้อการ์ดหนึ่งใบ — ใช้ทั้งแบบใบเดียวและแบบเรียงกันหลายใบ
 *
 * `lead` คือประโยคนำที่เคยเป็นข้อความแยกอยู่ข้างหน้าการ์ด
 * รวมเข้ามาไว้ในการ์ดเลย เพราะสองฟองที่พูดเรื่องเดียวกันไม่ได้อ่านง่ายขึ้น
 * แค่ยาวขึ้น และในแชทที่มีข้อความอื่นแทรก มันอาจถูกแยกจากกันได้ด้วย
 */
function extractedBubble(d: ExtractedDoc, today: ISODate, lead?: string): LineMessage {
  const rows: LineMessage[] = [];
  if (d.label) rows.push(row('เลขที่/ทะเบียน', d.label));
  rows.push(row('หมดอายุ', formatThai(d.expiry)));
  rows.push(row('เหลืออีก', humanRemaining(today, d.expiry), true));

  return {
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', spacing: 'md',
      contents: [
        ...(lead ? [headRow(lead, '07-search'), { type: 'separator', margin: 'md' }] : []),
        docRow(d.typeKey, d.label, 'md'),
        { type: 'box', layout: 'vertical', spacing: 'sm', margin: 'md', contents: rows },
      ],
    },
    styles: { body: { backgroundColor: CARD_BG } },
  };
}

export function confirmExtracted(args: ExtractedDoc & { today: ISODate }): LineMessage[] {
  const t = docType(args.typeKey);
  const card: LineMessage = {
    type: 'flex',
    altText: `${t.label} หมดอายุ ${formatThai(args.expiry)}`,
    contents: extractedBubble(
      args,
      args.today,
      // ประโยคนี้ต้องสั้นกว่าความอยากอธิบายของเรา
      // ของเดิมสองบรรทัดพูดสามเรื่อง: อ่านได้ / ตั้งเตือนแล้ว / แก้ได้
      // เหลือสองเรื่องที่เขาต้องรู้จริง ๆ คือ เก็บให้แล้ว และ แก้ได้
      'บันทึกให้แล้ว ผิดแก้ได้เลยครับ'
    ),
  };
  card.quickReply = chips([
    { label: 'ถูกต้อง', data: pb('confirm', { d: args.documentId }), icon: 'check' },
    // ปฏิทินเปิดตรงนี้เลย — เดิมเป็น postback แล้วค่อยส่งปุ่มปฏิทินตามมา
    // ทำให้ผู้ใช้ต้องกดสองรอบเพื่อทำเรื่องเดียว
    { label: 'แก้ไขวันที่', data: pb('setdate', { d: args.documentId }), date: true, initial: args.expiry, icon: 'calendar' },
  ]);
  return [card];
}

/**
 * ส่งรูปมาทีเดียวหลายใบ
 *
 * LINE แสดง quickReply ของข้อความสุดท้ายเท่านั้น
 * ถ้าตอบแยกใบละข้อความ ปุ่มของใบก่อน ๆ จะถูกทับหายไปหมด
 * ผู้ใช้จะยืนยันได้แค่ใบสุดท้าย และไม่มีทางรู้ว่าใบอื่นหายไปไหน
 *
 * จึงต้องตอบครั้งเดียว การ์ดเรียงกันในแถวเดียว แล้วมีปุ่มชุดเดียวคุมทั้งหมด
 */
export function confirmExtractedMany(docs: ExtractedDoc[], today: ISODate): LineMessage[] {
  if (docs.length === 0) return [];
  if (docs.length === 1) return confirmExtracted({ ...docs[0], today });

  const card: LineMessage = {
    type: 'flex',
    altText: `อ่านได้ ${docs.length} ใบ`,
    contents: { type: 'carousel', contents: docs.slice(0, 10).map((d) => extractedBubble(d, today)) },
  };
  card.quickReply = chips([
    { label: `ถูกต้องทั้ง ${docs.length} ใบ`, data: pb('confirm_all'), icon: 'check' },
    // แก้ทีละใบทำในหน้าเว็บ เพราะแชทให้ปุ่มได้ชุดเดียวต่อข้อความ
    { label: 'แก้ทีละใบ', liff: true, icon: 'edit' },
  ]);
  return [
    text(`อ่านได้ ${docs.length} ใบ บันทึกให้แล้ว\nเลื่อนดูทางขวา ผิดแก้ได้เลยครับ`),
    card,
  ];
}

/** ยืนยันรวดเดียวหลายใบ */
export function savedMany(
  docs: Array<{ typeKey: string; label?: string | null; expiry: ISODate }>,
  today: ISODate
): LineMessage[] {
  const lines = docs.map(
    (d) => `${docType(d.typeKey).emoji} ${displayName(d.typeKey, d.label)} — ${formatThai(d.expiry)}`
  );
  return [
    text(
      `บันทึกแล้วครับ ✅\n${lines.join('\n')}\n\nลืมได้เลยครับ ผมจำให้แล้ว`,
      chips([
        { label: LIST_NAME, liff: true, icon: 'doc' },
        { label: 'เพิ่มเอกสารอื่น', camera: true, icon: 'camera' },
      ])
    ),
  ];
}

/**
 * กดปุ่มในการ์ดเดิมซ้ำ — การ์ด LINE ที่ส่งไปแล้วแก้ไม่ได้ ปุ่มจึงยังกดได้เสมอ
 * กันที่ฝั่งเซิร์ฟเวอร์แทน ไม่งั้นคิวเตือนจะถูกสร้างใหม่ทุกครั้งที่กด
 */
export function alreadyConfirmed(typeKey: string, label: string | null | undefined, expiry: ISODate): LineMessage[] {
  return [
    text(
      `${displayName(typeKey, label)} ยืนยันไปแล้วครับ ✅\nหมดอายุ ${formatThai(expiry)}`,
      chips([
        { label: LIST_NAME, liff: true, icon: 'doc' },
        { label: 'เพิ่มเอกสารอื่น', camera: true, icon: 'camera' },
      ])
    ),
  ];
}

/** ส่งใบเดิมซ้ำ — บอกตรง ๆ ดีกว่าเพิ่มซ้ำเงียบ ๆ */
export function alreadyHave(typeKey: string, label: string | null | undefined, expiry: ISODate): LineMessage[] {
  return [
    text(
      `${displayName(typeKey, label)} มีอยู่ในรายการแล้วครับ\nหมดอายุ ${formatThai(expiry)}\n\nผมจะไม่บันทึกซ้ำนะครับ`,
      chips([
        { label: LIST_NAME, liff: true, icon: 'doc' },
        { label: 'เพิ่มเอกสารอื่น', camera: true, icon: 'camera' },
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
  documentId: string;
  typeKey: string;
  label?: string | null;
  from: ISODate;
  to: ISODate;
  reminderDates: Array<{ send_on: ISODate; offset_days: number }>;
  today: ISODate;
}): LineMessage[] {
  return [
    text(
      `ต่ออายุแล้วนี่เอง ✅\n${displayName(args.typeKey, args.label)}\n\n` +
        `${formatThai(args.from)} → ${formatThai(args.to)}` +
        schedule(args.reminderDates, args.today),
      confirmChips(args.documentId, args.to)
    ),
  ];
}

/** ขยับไม่กี่วัน = ครั้งก่อนอ่านผิด ไม่ใช่ต่ออายุ (ห้ามนับเป็น renewed_count) */
export function correctedDate(args: {
  documentId: string;
  typeKey: string;
  label?: string | null;
  from: ISODate;
  to: ISODate;
  reminderDates: Array<{ send_on: ISODate; offset_days: number }>;
  today: ISODate;
}): LineMessage[] {
  return [
    text(
      `ครั้งก่อนผมอ่านผิดไปนิดครับ 🙏\n${displayName(args.typeKey, args.label)}\n\n` +
        `แก้จาก ${formatThai(args.from)}\nเป็น ${formatThai(args.to)} ให้แล้ว` +
        schedule(args.reminderDates, args.today),
      confirmChips(args.documentId, args.to)
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
        { label: 'ต่ออายุแล้ว', data: pb('renew_existing', { d: args.existingId }), icon: 'renew' },
        { label: 'ครั้งก่อนอ่านผิด', data: pb('fix_date', { d: args.existingId }), icon: 'edit' },
        { label: 'คนละใบ', data: pb('as_new'), icon: 'plus' },
      ])),
    ];
  }

  return [
    text(head + 'ใบนี้คืออันไหนครับ', chips([
      { label: 'ต่ออายุใบเดิม', data: pb('renew_existing', { d: args.existingId }), icon: 'renew' },
      { label: 'คนละใบ/คนละคัน', data: pb('as_new'), icon: 'plus' },
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
      ? 'ได้ครับ เอกสารนี้หมดอายุวันไหนครับ\nพิมพ์มาเลยก็ได้ เช่น "30/6/69"'
      : 'รูปไม่ค่อยชัดครับ 😅\nไม่เป็นไร พิมพ์บอกผมตรง ๆ ก็ได้\n\nเอกสารนี้หมดอายุวันไหนครับ';

  const data = pb('setdate', {
    ...(args.documentId ? { d: args.documentId } : {}),
    ...(args.typeKey ? { k: args.typeKey } : {}),
  });

  return [
    text(body, chips([
      { label: 'เลือกวันที่', data, date: true, icon: 'calendar' },
      { label: 'ถ่ายใหม่', camera: true, icon: 'camera' },
    ])),
  ];
}

/**
 * กด "เพิ่มเอกสาร" จาก rich menu
 *
 * rich menu เปิดกล้องตรง ๆ ไม่ได้ — LINE ไม่มี action ชนิด camera ให้ใช้ที่นั่น
 * จึงต้องตอบด้วยข้อความที่มีปุ่มกล้องแทน และในเมื่อต้องเสียหนึ่งจังหวะอยู่แล้ว
 * ก็ใช้จังหวะนั้นบอกทางพิมพ์ไปด้วยเลย คนที่ไม่มีเอกสารอยู่ในมือจะได้ไม่ต้องปิดแชทไป
 */
export function howToAdd(): LineMessage[] {
  return [
    text(
      'ถ่ายรูปเอกสารส่งมาได้เลยครับ\n' +
        'หรือพิมพ์บอกก็ได้ เช่น\n' +
        '"พ.ร.บ. หมดอายุ 30/6/69"',
      chips([{ label: 'ถ่ายรูป', camera: true, icon: 'camera' }])
    ),
  ];
}

/**
 * เลือกประเภทมาแล้ว เหลือแค่ตัวเลขวัน
 *
 * เคยเขียนเป็น quickReply ดิบ ๆ อยู่ใน handlers ซึ่งแปลว่าไอคอนกับกฎ 20 ตัวอักษร
 * ไม่ผ่าน chips() — ข้อความที่สร้างนอกไฟล์นี้คือข้อความที่ลืมอัปเดต
 */
export function askPhotoFor(typeKey: string): LineMessage[] {
  const t = docType(typeKey);
  return [
    text(
      `ได้ครับ ${t.emoji} ${t.label}\n` +
        `${t.hint ?? 'ถ่ายรูปหน้าที่มีวันหมดอายุมาได้เลย'}\n\n` +
        'หรือพิมพ์วันหมดอายุมาตรง ๆ ก็ได้ครับ',
      chips([
        { label: 'ถ่ายรูป', camera: true, icon: 'camera' },
        { label: 'เลือกวันที่', data: pb('setdate', { k: typeKey }), date: true, icon: 'calendar' },
      ])
    ),
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
    text(body, chips(opts.map((t): Chip => ({
      label: t.label, data: pb('type', { k: t.key }), imageUrl: docIcon(t.key),
    })))),
  ];
}

/* ============================================================
 * ฉาก 03 — ยืนยันแล้ว ประกาศสัญญาเป็นตัวเลข แล้วดันใบที่ 2
 *
 * "ผมจะเตือนคุณ N ครั้ง" + วันที่จริง คือข้อความที่ทำให้เขาไม่บล็อก
 * เขาเห็นสัญญาที่ตรวจสอบได้ ไม่ใช่คำโฆษณา
 * ============================================================ */
/**
 * ท้ายข้อความที่เพิ่งเปลี่ยนวันหมดอายุ
 *
 * ทุกครั้งที่วันเปลี่ยน ผู้ใช้ถามสองอย่างเสมอ: ตกลงจะเตือนฉันเมื่อไหร่
 * และถ้าอ่านผิดอีกจะแก้ยังไง — ตอบทั้งสองอย่างไปพร้อมกันเลย
 * ไม่ใช่บอกแค่รอบถัดไปรอบเดียวแล้วปล่อยให้เขาเดาว่ามีอีกไหม
 */
function schedule(rows: Array<{ send_on: ISODate; offset_days: number }>, today: ISODate): string {
  const lines = reminderLines(rows, today);
  if (lines.length === 0) return '\n\nผมอัปเดตให้แล้วครับ';
  return `\n\nผมจะเตือนคุณ ${lines.length} ครั้ง\n${lines.join('\n')}\n\nลืมได้เลยครับ ผมจำให้แล้ว`;
}

/** ไม่มีปุ่ม "ถูกต้อง" เพราะบันทึกไปแล้ว — ปุ่มที่ยังมีความหมายคือปุ่มแก้ */
function confirmChips(documentId: string, current: ISODate): LineMessage {
  return chips([
    { label: 'ไม่ใช่วันนี้ แก้ไข', data: pb('setdate', { d: documentId }), date: true, initial: current, icon: 'calendar' },
    { label: LIST_NAME, liff: true, icon: 'doc' },
  ]);
}

/**
 * บรรทัด "จะเตือนวันไหนบ้าง"
 *
 * ใช้ร่วมกันระหว่างตอนบันทึกใหม่กับตอนกดต่อเองแล้ว
 * เพราะผู้ใช้คาดหวังคำตอบเดียวกัน: ตกลงแล้วจะเตือนฉันเมื่อไหร่
 */
function reminderLines(rows: Array<{ send_on: ISODate; offset_days: number }>, today: ISODate): string[] {
  return rows
    .filter((r) => r.offset_days <= 0 && r.send_on > today)
    .map((r) => {
      const when = r.offset_days <= -60 ? 'วันแรกที่ต่อได้' : `เหลือ ${Math.abs(r.offset_days)} วัน`;
      return `📅 ${formatThai(r.send_on)} — ${when}`;
    });
}

export function savedAndSuggestMore(args: {
  typeKey: string;
  label?: string | null;
  reminderDates: Array<{ send_on: ISODate; offset_days: number }>;
  docCount: number;
  today: ISODate;
  /** วันหมดอายุที่บันทึกไว้ — ต้องทวนให้ผู้ใช้เห็นเสมอ */
  expiry?: ISODate;
  /** ประเภทที่ผู้ใช้มีอยู่แล้ว — ของที่มีได้ใบเดียวจะไม่ถูกชวนซ้ำ */
  ownedTypeKeys?: string[];
}): LineMessage[] {
  /**
   * รอบที่ถึงกำหนดวันนี้ถูกส่งไปกับข้อความเดียวกันนี้แล้ว (inlineDueToday)
   * จึงห้ามเอามาลิสต์ว่า "จะเตือน" — มันอยู่ตรงหน้าเขาแล้ว
   */
  const upcoming = args.reminderDates.filter((r) => r.offset_days <= 0);
  const sentNow = upcoming.filter((r) => r.send_on <= args.today);
  const future = upcoming.filter((r) => r.send_on > args.today);

  const body: LineMessage[] = [
    headRow('บันทึกแล้วครับ', '13-thumbsup'),
  ];

  // ทวนสิ่งที่บันทึกไปเสมอ ผู้ใช้เพิ่งส่งรูปหรือเพิ่งเลือกวันมา ต้องเห็นว่าระบบรับไปถูก
  if (args.expiry) {
    body.push(
      { type: 'separator', margin: 'md' },
      {
        type: 'box', layout: 'vertical', spacing: 'sm', margin: 'md',
        contents: [
          docRow(args.typeKey, args.label, 'md'),
          row('หมดอายุ', formatThai(args.expiry)),
          row('เหลืออีก', humanRemaining(args.today, args.expiry), true),
        ],
      }
    );
  }

  /**
   * รอบเตือนเป็นตารางสองคอลัมน์ ไม่ใช่บรรทัดข้อความติดกัน
   * วันที่อยู่ซ้าย เหตุผลอยู่ขวา ตากวาดลงมาแล้วเทียบกันได้ทันที
   * ในข้อความล้วนทำแบบนี้ไม่ได้ ต้องใช้ขีดคั่น ซึ่งอ่านยากกว่ามาก
   */
  if (future.length > 0) {
    body.push(
      { type: 'separator', margin: 'md' },
      {
        type: 'box', layout: 'vertical', spacing: 'sm', margin: 'md',
        contents: [
          { type: 'text', text: `จะเตือน ${future.length} ครั้ง`, size: 'xs', color: MUTED },
          ...future.map((r) => ({
            type: 'box', layout: 'horizontal',
            contents: [
              { type: 'text', text: formatThai(r.send_on), size: 'sm', flex: 3 },
              {
                type: 'text', size: 'xs', color: MUTED, align: 'end', flex: 3,
                text: r.offset_days <= -60 ? 'วันแรกที่ต่อได้' : `เหลือ ${Math.abs(r.offset_days)} วัน`,
              },
            ],
          })),
        ],
      }
    );
  }

  /**
   * มีการ์ดเตือนด่วนต่อท้าย — ปิดท้ายด้วยการชี้ลงไปข้างล่าง แล้วจบ
   *
   * สองเหตุผลที่ไม่ชวนเพิ่มเอกสารตอนนี้
   *   1. ผู้ใช้กำลังโฟกัสของที่ใกล้หมดอายุ ชวนคุยเรื่องอื่นคือขัดจังหวะ
   *   2. LINE แสดง quickReply ของ "ข้อความสุดท้าย" เท่านั้น
   *      ถ้าเอาชิปชวนเพิ่มมาแทรก ปุ่มของการ์ดเตือนจะหายไปทั้งหมด
   */
  if (sentNow.length > 0) {
    body.push(
      { type: 'separator', margin: 'md' },
      { type: 'text', margin: 'md', size: 'sm', wrap: true, weight: 'bold', color: WARN,
        text: 'ใกล้ครบกำหนดแล้ว ดูรายละเอียดข้างล่างครับ' }
    );
    return [flexCard(body, `บันทึกแล้ว — ${plainName(args.typeKey, args.label)}`)];
  }

  if (args.docCount >= 3) {
    // ฉาก 04 — สัญญาว่าจะเงียบ
    const next = future[0];
    body.push(
      { type: 'separator', margin: 'md' },
      { type: 'text', margin: 'md', size: 'sm', wrap: true,
        text: `ตอนนี้ผมดูให้ ${args.docCount} รายการแล้ว` },
      { type: 'text', size: 'xs', color: MUTED, wrap: true,
        text: next
          ? `ครั้งต่อไปที่จะได้ยินจากผมคือ ${formatThai(next.send_on)} ระหว่างนี้ผมเงียบครับ`
          : 'ระหว่างนี้ผมเงียบครับ' }
    );
    const card = flexCard(body, `บันทึกแล้ว — ดูให้ ${args.docCount} รายการ`);
    card.quickReply = chips([{ label: LIST_NAME, liff: true, icon: 'doc' }]);
    return [card];
  }

  // ชวนเพิ่มให้เข้ากับสิ่งที่เพิ่งบันทึก — บันทึกบัตรประชาชนแล้วพูดเรื่องรถ คนจะงง
  const group = SUGGEST_BY_GROUP[docType(args.typeKey).group];
  const owned = new Set(args.ownedTypeKeys ?? []);
  const suggest = group.keys
    .filter((k) => k !== args.typeKey)
    // อย่าชวนเพิ่มบัตรประชาชนถ้าเขามีแล้ว — คนหนึ่งมีได้ใบเดียว
    .filter((k) => !(owned.has(k) && docType(k).singleton))
    .slice(0, 3)
    .map(docType);

  body.push(
    { type: 'separator', margin: 'md' },
    { type: 'text', margin: 'md', size: 'sm', wrap: true, text: 'ลืมได้เลยครับ ผมจำให้แล้ว' },
    { type: 'text', size: 'sm', wrap: true, color: TEAL, weight: 'bold', text: group.prompt }
  );

  const card = flexCard(body, `บันทึกแล้ว — ${plainName(args.typeKey, args.label)}`);
  /**
   * ชิปชวนเพิ่มเปิดกล้องเลย ไม่ต้องผ่านเซิร์ฟเวอร์ก่อน
   *
   * เดิมเป็น postback: กด → เด้งชื่อประเภทขึ้นในแชท → เราตอบให้ถ่ายรูป
   * → เขาค่อยกดกล้อง สามจังหวะเพื่อทำเรื่องเดียว
   * แล้วสิ่งที่ได้จากการรู้ประเภทล่วงหน้าก็แทบไม่มี — OCR อ่านเองอยู่แล้ว
   * ป้ายจึงเป็นแค่คำใบ้ว่าควรถ่ายอะไร ไม่ใช่คำตอบที่ต้องส่งกลับมา
   */
  card.quickReply = chips([
    ...suggest.map((t): Chip => ({ label: t.label, camera: true, imageUrl: docIcon(t.key) })),
    { label: 'ยังก่อน', data: pb('later'), icon: 'bell' },
  ]);
  return [card];
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

export function upcomingReminder(
  items: ReminderItem[],
  today: ISODate,
  actionsByType: Record<string, RenewAction[]> = {},
  /** พิกัดหยาบที่ผู้ใช้เคยแชร์ไว้ — ทำให้ลิงก์แผนที่ค้นรอบตัวเขาจริง ๆ */
  area?: { lat: number; lng: number } | null
): LineMessage[] {
  if (items.length === 0) return [];

  const soonest = items.reduce((a, b) => (a.expiry <= b.expiry ? a : b));
  const t = docType(soonest.typeKey);
  const early = soonest.offsetDays <= -60;
  const urgent = soonest.offsetDays > -14;

  const header = early
    ? `${plainName(soonest.typeKey, soonest.label)}\nต่อได้ตั้งแต่วันนี้แล้วครับ`
    : items.length > 1
    ? `มี ${items.length} รายการใกล้ครบกำหนด`
    : `${plainName(soonest.typeKey, soonest.label)} ใกล้ครบกำหนดแล้ว`;

  const rows = items.map((it) => ({
    type: 'box', layout: 'vertical', spacing: 'xs',
    contents: [
      docRow(it.typeKey, it.label, 'sm'),
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

  /**
   * ปุ่มมาจากวิธีต่ออายุจริงของเอกสารนั้น ไม่ใช่ชุดเดียวใช้ทุกใบ
   * เอกสารที่เราหาเงินไม่ได้ (บัตรประชาชน พาสปอร์ต) ต้องยังมีประโยชน์
   * ไม่งั้นการเตือนกลายเป็นแค่การรบกวน
   */
  /**
   * ปุ่มทั้งหมดอยู่ที่ quick reply ไม่ใช่ในการ์ด
   *
   * สามเหตุผล
   *   1. quick reply ใส่ไอคอนรูปของเราเองได้ ปุ่มใน Flex ใส่ไม่ได้
   *      ไอคอนทั้งระบบจึงเป็นชุดเดียวกันได้ก็ต่อเมื่อปุ่มอยู่ที่เดียวกัน
   *   2. quick reply หายไปเองเมื่อมีข้อความใหม่
   *      ส่วนการ์ดเก่าค้างอยู่ในแชทตลอดกาล ผู้ใช้เลื่อนขึ้นไปกดปุ่มของเมื่อเดือนที่แล้วได้
   *      แล้วระบบก็ต้องมาคอยกันทีหลังว่ากดซ้ำหรือเปล่า
   *   3. location / camera ใช้ได้เฉพาะใน quick reply อยู่แล้ว
   *      ปุ่มอยู่สองที่แปลว่าต้องจำกฎสองชุด
   *
   * ที่แลกไปคือปุ่มไม่ติดอยู่กับการ์ด — ถ้าผู้ใช้พิมพ์อะไรต่อ ชิปจะหาย
   * รับได้ เพราะหน้า "เอกสารของฉัน" มีปุ่มชุดเดียวกันครบทุกใบแบบไม่หายไปไหน
   * แชทเป็นที่ชั่วคราว หน้าเว็บเป็นที่ถาวร
   */
  const quick: Chip[] = [];

  // ปุ่มขึ้นเฉพาะตอนที่ทำได้จริง — ปุ่มที่กดแล้วไปเจอ "ยังต่อไม่ได้ครับ" แย่กว่าไม่มีปุ่ม
  const win = renewWindow(soonest.typeKey, soonest.expiry, today);
  for (const a of (win.open ? actionsByType[soonest.typeKey] ?? [] : []).slice(0, 4)) {
    if (a.kind === 'upsell') {
      const price = docType(soonest.typeKey).upsell?.price;
      quick.push({ label: `${a.label}${price ? ` ${price}฿` : ''}`, data: pb('upsell', { d: soonest.documentId }), icon: 'spark' });
    } else if (a.kind === 'link' && a.url) {
      quick.push({ label: a.label, uri: a.url, icon: 'globe' });
    } else if (a.kind === 'location' && a.searchTerm) {
      // ปุ่มเขียนว่า "ใกล้ฉัน" ต้องค้นหาให้เลย
      // location action เปิดได้แค่หน้าเลือกสถานที่ของ LINE ซึ่งไม่รับคำค้นของเรา
      // ผู้ใช้เลยเจอร้านอาหารแถวบ้านแทนที่จะเจอที่ว่าการอำเภอ
      quick.push({ label: a.label, uri: mapsSearchUrl(a.searchTerm, area?.lat, area?.lng), icon: 'pin' });
    }
  }
  // การ์ดรวมหลายใบ: ห้ามเดาว่าเขาต่อครบทุกใบ ให้เลือกทีละใบ
  quick.push(
    items.length > 1
      ? { label: 'ต่อเองแล้ว', data: pb('renewed_pick'), icon: 'check' }
      : { label: 'ต่อเองแล้ว', data: pb('renewed', { d: soonest.documentId }), icon: 'check' }
  );

  const card = bubble(
      [
        headRow(header, urgent ? '12-announce' : '19-calendar'),
        ...(!win.open && win.opensOn
          ? [{ type: 'text', text: `ยังไม่ถึงรอบต่อ — ต่อได้ตั้งแต่ ${formatThai(win.opensOn)}`, size: 'xs', color: MUTED, wrap: true }]
          : early && t.renewWindowDays
          ? [{ type: 'text', text: 'ต่อตอนนี้ไม่มีค่าปรับ และไม่ต้องรีบ', size: 'xs', color: MUTED, wrap: true }]
          : []),
        { type: 'separator', margin: 'md' },
        { type: 'box', layout: 'vertical', spacing: 'md', margin: 'md', contents: rows },
      ],
      undefined,
      `เตือน: ${displayName(soonest.typeKey, soonest.label)} ${humanRemaining(today, soonest.expiry)}`
  );

  quick.push({ label: LIST_NAME, liff: true, icon: 'doc' });
  card.quickReply = chips(quick);
  return [card];
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
          { label: 'ต่อแล้ว', data: pb('renewed', { d: first.documentId }), icon: 'check' },
          { label: 'ยังเลย ช่วยที', data: pb('upsell', { d: first.documentId }), icon: 'spark' },
          { label: 'ไม่ได้ใช้แล้ว', data: pb('archive', { d: first.documentId }), icon: 'box' },
        ])
      ),
    ];
  }

  const rows = items.slice(0, 4).map((it) => ({
    type: 'box', layout: 'vertical', spacing: 'xs', margin: 'md',
    contents: [
      docRow(it.typeKey, it.label, 'sm'),
      { type: 'text', text: `ครบกำหนด ${formatThai(it.expiry)}`, size: 'xs', color: MUTED },
    ],
  })) as LineMessage[];

  const card = bubble(
    [
      headRow(`มี ${items.length} รายการครบกำหนดแล้วครับ`, '04-excited'),
      { type: 'text', text: 'ต่อใบไหนไปแล้ว กดใบนั้นได้เลยครับ', size: 'sm', color: MUTED, wrap: true },
      { type: 'separator', margin: 'md' },
      ...rows,
    ],
    undefined,
    'มีเอกสารครบกำหนดแล้ว'
  );
  card.quickReply = chips([
    ...items.slice(0, 4).map((it): Chip => ({
      label: displayName(it.typeKey, it.label),
      data: pb('renewed', { d: it.documentId }),
      icon: 'check',
    })),
    { label: LIST_NAME, liff: true, icon: 'doc' },
  ]);
  return [card];
}

/**
 * ตอบหลังกด "ต่อแล้ว"
 *
 * วันใหม่มาจาก termMonths ซึ่งเป็นค่ามาตรฐาน แต่ของจริงไม่ตายตัว
 * (ใบขับขี่ใบแรกอายุสั้นกว่ารอบต่อไป กฎก็เปลี่ยนได้)
 * จึงต้องมีปุ่มให้แก้ทันทีในข้อความเดียวกัน ไม่ใช่บังคับให้รับค่าที่เราเดา
 */
export function rolledOver(args: {
  documentId: string;
  typeKey: string;
  label?: string | null;
  newExpiry: ISODate;
  /** รอบเตือนที่คำนวณใหม่ — ต้องบอกเหมือนตอนบันทึกใบใหม่ */
  reminderDates?: Array<{ send_on: ISODate; offset_days: number }>;
  today?: ISODate;
}): LineMessage[] {
  /**
   * ต่ออายุแล้วก็ยังต้องได้คำตอบเดิมว่า "แล้วจะเตือนฉันเมื่อไหร่"
   * ไม่บอก ผู้ใช้จะไม่รู้ว่าระบบยังดูให้อยู่ไหม แล้วต้องกลับมาเช็กเอง
   * — ซึ่งเป็นสิ่งเดียวที่ผลิตภัณฑ์นี้สัญญาว่าเขาไม่ต้องทำ
   */
  const lines =
    args.reminderDates && args.today ? reminderLines(args.reminderDates, args.today) : [];
  const schedule =
    lines.length > 0
      ? `\n\nผมจะเตือนคุณ ${lines.length} ครั้ง\n${lines.join('\n')}\n\nลืมได้เลยครับ ผมจำให้แล้ว`
      : '';

  return [
    text(
      `เยี่ยมครับ ✅\n${displayName(args.typeKey, args.label)}\nผมเลื่อนไปเป็น ${formatThai(args.newExpiry)} ให้แล้ว${schedule}`,
      confirmChips(args.documentId, args.newExpiry)
    ),
  ];
}

/** เลือกว่าต่ออายุใบไหนบ้าง — จากการ์ดเตือนที่รวมหลายใบ */
export function pickRenewed(items: ReminderItem[], today: ISODate): LineMessage[] {
  const rows = items.slice(0, 4).map((it) => ({
    type: 'box', layout: 'vertical', spacing: 'xs', margin: 'md',
    contents: [
      docRow(it.typeKey, it.label, 'sm'),
      { type: 'text', text: `หมดอายุ ${formatThai(it.expiry)} · ${humanRemaining(today, it.expiry)}`, size: 'xs', color: MUTED, wrap: true },
    ],
  })) as LineMessage[];

  const card = bubble(
    [
      headRow('ต่ออายุใบไหนไปแล้วบ้างครับ', '19-calendar'),
      { type: 'text', text: 'กดทีละใบได้เลย ไม่ต้องต่อครบทุกใบก็ได้', size: 'xs', color: MUTED, wrap: true },
      { type: 'separator', margin: 'md' },
      ...rows,
    ],
    undefined,
    'ต่ออายุใบไหนไปแล้วบ้าง'
  );
  card.quickReply = chips(
    items.slice(0, 4).map((it): Chip => ({
      label: displayName(it.typeKey, it.label),
      data: pb('renewed', { d: it.documentId }),
      icon: 'check',
    }))
  );
  return [card];
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
        { label: 'ส่งข้อมูล', data: pb('upsell_start', { k: typeKey }), icon: 'spark' },
        { label: 'ขอถามก่อน', data: pb('human'), icon: 'chat' },
      ])
    ),
  ];
}

/* ============================================================
 * ฉาก 11 — กรณีขอบ
 * ============================================================ */
/**
 * ผู้ใช้แชร์พิกัดมา — ตอบด้วยลิงก์แผนที่ของสถานที่ที่เขาต้องไปจริง
 * เลือกจากเอกสารที่ใกล้ครบกำหนดที่สุดของเขา ไม่ใช่รายการทั่วไป
 */
export function nearbyPlaces(places: Array<{ label: string; url: string }>): LineMessage[] {
  if (places.length === 0) {
    return [
      text('ขอบคุณครับ 🙏 ผมจำพื้นที่นี้ไว้ใช้แนะนำคราวหน้านะครับ',
        chips([{ label: LIST_NAME, liff: true, icon: 'doc' }])),
    ];
  }
  return [
    text('แถวนี้มีที่ไหนบ้าง กดดูได้เลยครับ 📍', {
      items: places.slice(0, 4).map((p) => ({
        type: 'action',
        action: { type: 'uri', label: clip(bare(p.label)), uri: p.url },
        ...(env.baseUrl ? { imageUrl: `${env.baseUrl}/icons/pin.png` } : {}),
      })),
    }),
  ];
}

export function notADocument(): LineMessage[] {
  /**
   * ใช้การ์ดเพราะจังหวะนี้ผู้ใช้เพิ่งทำอะไรแล้วไม่สำเร็จ
   * มาสคอตท่างงบอกว่า "ระบบอ่านไม่ออก" ไม่ใช่ "คุณทำผิด"
   * ซึ่งเป็นคนละความรู้สึกกันมาก สำหรับคนที่กำลังจะเลิกใช้
   */
  const card = bubble(
    [
      headRow('อันนี้ผมอ่านไม่ออกครับ', '15-confused'),
      { type: 'text', text: 'ถ่ายใหม่ให้เห็นวันหมดอายุชัด ๆ ได้ไหมครับ', size: 'sm', wrap: true },
      { type: 'separator', margin: 'md' },
      {
        type: 'text', margin: 'md', size: 'sm', wrap: true, color: MUTED,
        text: 'หรือพิมพ์บอกผมตรง ๆ ก็ได้ เช่น\n"ภาษีรถ 1กก 1234 หมด 31/12/69"',
      },
    ],
    undefined,
    'อ่านรูปไม่ออก'
  );
  card.quickReply = chips([{ label: 'ถ่ายใหม่', camera: true, icon: 'camera' }]);
  return [card];
}

export function confirmDelete(docCount: number): LineMessage[] {
  return [
    text(
      `ได้ครับ ผมจะลบเอกสารทั้ง ${docCount} รายการ\nและรูปที่เคยส่งมาทั้งหมดถาวร\n\nยืนยันไหมครับ`,
      chips([
        { label: 'ยืนยันลบ', data: pb('delete_confirm'), icon: 'box' },
        { label: 'ยกเลิก', data: pb('cancel'), icon: 'close' },
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
      text: `เปิดดู${LIST_NAME}ได้ที่นี่ครับ`,
      quickReply: {
        items: [{ type: 'action', action: { type: 'uri', label: LIST_NAME, uri: liffUrl } }],
      },
    },
  ];
}

/**
 * ฉากที่ไม่มีใครอยากออกแบบ — ของเราพังเอง
 *
 * ของเดิมเขียนว่า "ระบบมีปัญหาชั่วคราว" ซึ่งผิดสองชั้น:
 *   1. ผู้ใช้เพิ่งพิมพ์ "วีซ่า 12/10/2570" มา แล้วได้คำว่าระบบมีปัญหากลับไป
 *      เขาอ่านว่า "มันอ่านภาษาไทยไม่ออก" ไม่ใช่ "โค้ดฝั่งเราพัง"
 *      แล้วเลิกพิมพ์ไปเลย ทั้งที่ทางนี้คือทางที่เร็วที่สุดของเขา
 *   2. คำว่า "ระบบมีปัญหา" ไม่บอกว่าเขาต้องทำอะไรต่อ และไม่บอกว่า
 *      ของที่เพิ่งส่งมาเข้าไปแล้วหรือยัง ซึ่งเป็นคำถามเดียวที่เขาสนใจ
 *
 * ที่นี่จึงรับผิดเป็นคำพูดของเรา บอกทางต่อ และบอกที่ให้ไปตรวจเองได้
 */
/**
 * พิมพ์อะไรมาแล้วเราอ่านไม่ออก — ไม่ใช่ความผิดของเขา
 *
 * fallback() เดิมตอบว่า "ผมช่วยจำวันหมดอายุเอกสารให้ครับ" ซึ่งเป็นคำโฆษณา
 * ไม่ใช่คำตอบ — คนที่พิมพ์ชื่อเอกสารมาแล้วโดนตอบแบบนี้ จะไม่รู้เลยว่า
 * ต้องพิมพ์ต่างจากเดิมยังไง เขาจึงเลิกพิมพ์ แล้วกลับไปทางที่ยาวกว่า
 *
 * ตัวอย่างสองบรรทัดสอนได้มากกว่าปุ่มสามปุ่ม เพราะมันบอกรูปแบบที่ใช้ได้จริง
 */
export function didNotUnderstand(): LineMessage[] {
  const card: LineMessage = {
    type: 'flex',
    altText: 'พิมพ์ชื่อเอกสารกับวันหมดอายุมาได้เลยครับ',
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          headRow('ผมยังไม่แน่ใจว่าเอกสารอะไรครับ', '15-confused'),
          {
            type: 'text', size: 'sm', wrap: true, margin: 'md',
            text: 'พิมพ์ชื่อเอกสารกับวันหมดอายุมาได้เลย',
          },
          {
            type: 'box', layout: 'vertical', spacing: 'xs',
            contents: [
              { type: 'text', size: 'sm', wrap: true, weight: 'bold', color: TEAL, text: '"วีซ่า 12/10/70"' },
              { type: 'text', size: 'sm', wrap: true, weight: 'bold', color: TEAL, text: '"พ.ร.บ. หมดอายุ 30 มิ.ย. 69"' },
            ],
          },
          {
            type: 'text', size: 'xs', wrap: true, color: MUTED,
            text: 'สะกดไม่ตรงก็ได้ครับ ผมเดาให้',
          },
        ],
      },
      styles: { body: { backgroundColor: CARD_BG } },
    },
  };
  card.quickReply = chips([
    { label: 'ส่งรูปเอกสาร', camera: true, icon: 'camera' },
    { label: LIST_NAME, liff: true, icon: 'doc' },
    { label: 'คุยกับคน', data: pb('human'), icon: 'chat' },
  ]);
  return [card];
}

export function hiccup(): LineMessage[] {
  const card: LineMessage = {
    type: 'flex',
    altText: 'ขออภัยครับ ผมรับไม่สำเร็จ',
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          headRow('ขออภัยครับ ผมรับไม่สำเร็จ', '15-confused'),
          {
            type: 'text', size: 'sm', wrap: true, margin: 'md',
            text: 'ส่งมาอีกครั้งได้เลยครับ\nถ้ายังไม่ขึ้น เปิด "' + LIST_NAME + '" ดูได้ว่าเข้าไปแล้วหรือยัง',
          },
        ],
      },
      styles: { body: { backgroundColor: CARD_BG } },
    },
  };
  card.quickReply = chips([
    { label: LIST_NAME, liff: true, icon: 'doc' },
    { label: 'ส่งรูปเอกสาร', camera: true, icon: 'camera' },
    { label: 'คุยกับคน', data: pb('human'), icon: 'chat' },
  ]);
  return [card];
}

export function fallback(): LineMessage[] {
  return [
    text(
      'ผมช่วยจำวันหมดอายุเอกสารให้ครับ\nส่งรูปเอกสารมาได้เลย',
      chips([
        { label: 'ส่งรูปเอกสาร', camera: true, icon: 'camera' },
        { label: LIST_NAME, liff: true, icon: 'doc' },
        { label: 'คุยกับคน', data: pb('human'), icon: 'chat' },
      ])
    ),
  ];
}
