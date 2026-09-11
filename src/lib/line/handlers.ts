/**
 * ตัวจัดการ event ทั้งหมดจาก LINE
 *
 * ⚠️ ทุกฟังก์ชันในไฟล์นี้ตอบด้วย reply() เท่านั้น (ฟรี)
 *    ห้าม import push จากที่นี่ — มี test บังคับไว้
 */
import { reply, getProfile, getMessageContent, showLoading } from './client';
import * as M from './messages';
import { ocr, extractFromText, CONFIDENCE_FLOOR } from '@/lib/ocr';
import type { Extraction } from '@/lib/ocr';
import { docType } from '@/lib/domain/docTypes';
import { isISODate, todayInBangkok } from '@/lib/domain/thaiDate';
import { env } from '@/lib/env';
import { rolloverExpiry } from '@/lib/domain/reminders';
import { loadRenewActions, mapsSearchUrl } from '@/lib/domain/renewActions';
import * as repo from '@/lib/db/repo';

type Ev = Record<string, any>;

export async function handleEvent(ev: Ev): Promise<void> {
  const userId: string | undefined = ev.source?.userId;
  if (!userId) return;

  switch (ev.type) {
    case 'follow':      return onFollow(ev, userId);
    case 'unfollow':    return void repo.markUnfollowed(userId);
    case 'message':     return onMessage(ev, userId);
    case 'postback':    return onPostback(ev, userId);
    default:            return;
  }
}

/* ---------------- ฉาก 01 ---------------- */

async function onFollow(ev: Ev, userId: string) {
  const profile = await getProfile(userId);
  await repo.upsertUser(userId, profile?.displayName);
  await repo.attachShopAttribution(userId);
  await repo.track('follow', userId);
  await reply(ev.replyToken, M.greeting());
}

/* ---------------- ข้อความ ---------------- */

async function onMessage(ev: Ev, userId: string) {
  await repo.upsertUser(userId);
  const msg = ev.message;
  const today = todayInBangkok();

  if (msg?.type === 'image') return onImage(ev, userId, msg.id);
  if (msg?.type === 'location') return onLocation(ev, userId, msg);

  if (msg?.type === 'text') {
    const t = String(msg.text ?? '').trim();

    // PDPA — ต้องทำงานได้จริงตั้งแต่ v1
    if (/ลบ.*(ข้อมูล|ทั้งหมด)|delete.*(my )?data/i.test(t)) {
      const n = await repo.countDocuments(userId);
      return reply(ev.replyToken, M.confirmDelete(n));
    }
    if (/รายการ|ดูทั้งหมด|list/i.test(t)) return replyList(ev.replyToken);
    if (/คุยกับคน|แอดมิน|admin|help/i.test(t)) {
      await repo.track('to_human', userId, { text: t.slice(0, 200) });
      return reply(ev.replyToken, M.toHuman());
    }
    /**
     * ไม่เข้าคำสั่งไหน — ลองอ่านเป็นเอกสารก่อนที่จะยอมแพ้
     *
     * "พ.ร.บ. หมดอายุ 30 มิ.ย. 69" คือทางที่สั้นที่สุดสำหรับคนที่
     * ไม่มีเอกสารอยู่ในมือตอนนั้น สั้นกว่าการกดปุ่มแล้วเลื่อนปฏิทินหลายจังหวะ
     */
    if (t.length >= 4) {
      await showLoading(userId, 10);
      try {
        const fromText = await extractFromText(t, today);
        if (fromText.isDocument && (fromText.docTypeKey || fromText.expiryDate)) {
          const pendingNow = await repo.getPending(userId);
          return saveExtraction({ ev, userId, extraction: fromText, today, pending: pendingNow, source: 'text' });
        }
      } catch (err) {
        // อ่านข้อความไม่ได้ไม่ใช่เรื่องคอขาดบาดตาย ตกไปที่ fallback ตามเดิม
        await repo.track('text_extract_error', userId, { message: String(err) });
      }
    }

    await repo.track('text_unmatched', userId, { text: t.slice(0, 200) });
    return reply(ev.replyToken, M.fallback());
  }

  return reply(ev.replyToken, M.fallback());
}

/**
 * ผู้ใช้กดปุ่ม "📍 ...ใกล้ฉัน" แล้วแชร์พิกัดมา
 *
 * ตอบด้วยลิงก์ค้นหา Google Maps ของสถานที่ที่เขาต้องไปจริง
 * โดยดูจากเอกสารที่เขามีอยู่ ไม่ใช่รายการทั่วไป
 */
async function onLocation(ev: Ev, userId: string, msg: Record<string, any>) {
  const lat = Number(msg.latitude);
  const lng = Number(msg.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return reply(ev.replyToken, M.fallback());

  await repo.saveUserArea(userId, { lat, lng, label: msg.address ?? msg.title ?? null });
  await repo.track('area_shared', userId);

  const [docs, actionsByType] = await Promise.all([
    repo.listDocuments(userId),
    loadRenewActions(),
  ]);

  // เอกสารเรียงตามใกล้ครบกำหนดอยู่แล้ว — หยิบปุ่มแบบ location ของแต่ละใบมา
  const places: Array<{ label: string; url: string }> = [];
  const seen = new Set<string>();
  for (const d of docs) {
    for (const a of actionsByType[d.doc_type] ?? []) {
      if (a.kind !== 'location' || !a.searchTerm || seen.has(a.searchTerm)) continue;
      seen.add(a.searchTerm);
      places.push({ label: a.label, url: mapsSearchUrl(a.searchTerm, lat, lng) });
    }
  }

  return reply(ev.replyToken, M.nearbyPlaces(places));
}

/* ---------------- ฉาก 02 / 02b ---------------- */

async function onImage(ev: Ev, userId: string, messageId: string) {
  const today = todayInBangkok();
  const pending = await repo.getPending(userId);

  await showLoading(userId, 25);

  let extraction;
  try {
    const buf = await getMessageContent(messageId);
    extraction = await ocr().extract(buf, 'image/jpeg');
  } catch (err) {
    await repo.track('ocr_error', userId, { message: String(err) });
    return reply(ev.replyToken, M.askDate({ typeKey: pending.docTypeKey, reason: 'ocr_miss' }));
  }

  if (!extraction.isDocument) {
    await repo.track('image_not_document', userId);
    return reply(ev.replyToken, M.notADocument());
  }

  return saveExtraction({ ev, userId, extraction, today, pending, source: 'ocr' });
}

/**
 * ทางเดินหลังอ่านเสร็จ — ใช้ร่วมกันทั้งรูปและข้อความที่พิมพ์มา
 *
 * สองทางเข้าต่างกันแค่วิธีอ่าน แต่คำถามที่เหลือเหมือนกันทุกข้อ
 * (รู้ประเภทไหม · ได้วันที่ไหม · มีใบนี้อยู่แล้วหรือเปล่า)
 * แยกโค้ดสองชุดเมื่อไหร่ ก็จะมีวันที่ทางหนึ่งได้ฟีเจอร์ อีกทางไม่ได้
 */
async function saveExtraction(args: {
  ev: Ev;
  userId: string;
  extraction: Extraction;
  today: string;
  pending: repo.PendingState;
  source: 'ocr' | 'text';
}) {
  const { ev, userId, extraction, today, pending, source } = args;
  const typeKey = extraction.docTypeKey ?? pending.docTypeKey ?? null;

  // ไม่รู้ว่าเอกสารอะไร — ถามผู้ใช้ ห้ามยัดลง "อื่น ๆ" แล้วเดาจังหวะเตือนเอง
  // แต่เก็บวันที่กับชื่อที่อ่านได้ไว้ก่อน จะได้ไม่ต้องให้เขาทำซ้ำ
  if (!typeKey) {
    await repo.track('type_unknown', userId, { label: extraction.label, source });
    await repo.setPending(userId, {
      awaiting: 'type',
      expiryDate: extraction.expiryDate ?? undefined,
      label: extraction.label ?? undefined,
      at: new Date().toISOString(),
    });
    return reply(ev.replyToken, M.askType({ expiry: extraction.expiryDate, label: extraction.label }));
  }

  // อ่านไม่ชัด หรือไม่มีวันที่ — ไม่เดา ไปถามตรง ๆ (ฉาก 02b)
  if (!extraction.expiryDate || extraction.confidence < CONFIDENCE_FLOOR) {
    await repo.track('extract_miss', userId, { confidence: extraction.confidence, typeKey, source });
    await repo.setPending(userId, { awaiting: 'date', docTypeKey: typeKey, at: new Date().toISOString() });
    return reply(ev.replyToken, M.askDate({ typeKey, reason: source === 'text' ? 'manual' : 'ocr_miss' }));
  }

  const handled = await handleExisting({
    replyToken: ev.replyToken, userId, typeKey,
    label: extraction.label, expiryDate: extraction.expiryDate, today,
  });
  if (handled) return;

  const doc = await repo.createDocument({
    lineUserId: userId,
    docTypeKey: typeKey,
    label: extraction.label,
    expiryDate: extraction.expiryDate,
    confirmed: false,
    source,
    meta: { ocr_confidence: extraction.confidence },
  });

  await repo.setPending(userId, null);
  await repo.track('extract_hit', userId, { typeKey, confidence: extraction.confidence, source });

  return reply(
    ev.replyToken,
    M.confirmExtracted({ documentId: doc.id, typeKey, label: doc.label, expiry: doc.expiry_date, today })
  );
}

/* ---------------- ปุ่มทั้งหมด ---------------- */

/** ปุ่มที่ต้องเขียนฐานข้อมูลก่อนตอบ — ต้องขึ้นจุดสามจุดให้เห็นก่อน */
const SLOW_ACTIONS = new Set([
  'confirm', 'setdate', 'type', 'renewed', 'renewed_pick',
  'renew_existing', 'fix_date', 'as_new', 'archive', 'delete_confirm', 'upsell',
]);

async function onPostback(ev: Ev, userId: string) {
  await repo.upsertUser(userId);
  const params = new URLSearchParams(ev.postback?.data ?? '');
  const action = params.get('a');
  const docId = params.get('d');
  const typeKey = params.get('k');
  const today = todayInBangkok();

  /**
   * ปุ่มพวกนี้เขียนฐานข้อมูลแล้วคำนวณรอบเตือนใหม่ ใช้เวลาหลายวินาที
   * ระหว่างนั้นหน้าจอนิ่งสนิท ผู้ใช้ไม่รู้ว่ากดติดหรือเปล่าแล้วจะกดซ้ำ
   * จุดสามจุดของ LINE ฟรี ไม่นับเป็นข้อความ
   */
  if (SLOW_ACTIONS.has(action ?? '')) await showLoading(userId, 15);

  switch (action) {
    /* ---- ฉาก 02 → 03 : ยืนยันว่าถูกต้อง ---- */
    case 'confirm': {
      if (!docId) return;
      const doc = await repo.getDocument(docId);
      if (!doc) return reply(ev.replyToken, M.fallback());

      // การ์ดที่ส่งไปแล้วแก้ไม่ได้ ปุ่มจึงกดซ้ำได้เสมอ — กันที่นี่แทน
      if (doc.confirmed_by_user) {
        return reply(ev.replyToken, M.alreadyConfirmed(doc.doc_type, doc.label, doc.expiry_date));
      }

      await repo.updateDocument(doc.id, { confirmed_by_user: true });
      const rows = await repo.regenerateReminders(doc, today);
      const count = await repo.countDocuments(userId);
      const owned = await repo.listDocTypeKeys(userId);
      await repo.track('doc_confirmed', userId, { typeKey: doc.doc_type, docCount: count });

      const urgent = await inlineDueToday({ userId, today, queued: rows, doc });
      return reply(ev.replyToken, [
        ...M.savedAndSuggestMore({
          typeKey: doc.doc_type, reminderDates: rows, docCount: count, today,
          expiry: doc.expiry_date, ownedTypeKeys: owned,
        }),
        ...urgent,
      ]);
    }

    /* ---- ผู้ใช้กด "แก้ไขวันที่" = ตัวอย่างที่โมเดลอ่านพลาด (ของมีค่า) ---- */
    case 'edit': {
      if (!docId) return;
      await repo.track('ocr_corrected', userId, { documentId: docId });
      await repo.setPending(userId, { awaiting: 'date', documentId: docId, at: new Date().toISOString() });
      return reply(ev.replyToken, M.askDate({ documentId: docId, reason: 'edit' }));
    }

    /* ---- datetimepicker ส่งวันที่กลับมาเป็น ISO เสมอ ---- */
    case 'setdate': {
      const picked = ev.postback?.params?.date as string | undefined;
      if (!picked || !isISODate(picked)) return reply(ev.replyToken, M.askDate({ reason: 'manual' }));

      const pending = await repo.getPending(userId);
      const targetDocId = docId ?? pending.documentId;
      const key = typeKey ?? pending.docTypeKey ?? 'custom';

      let doc;
      if (targetDocId) {
        await repo.updateDocument(targetDocId, { expiry_date: picked, confirmed_by_user: true, source: 'manual' });
        doc = await repo.getDocument(targetDocId);
      } else {
        /**
         * เลือกวันที่โดยยังไม่มีใบให้แก้ = กำลังสร้างใบใหม่
         * จึงต้องเทียบกับของที่มีอยู่ก่อน เหมือนทางที่มาจากรูปทุกประการ
         *
         * ที่ผ่านมาทางนี้ข้ามการเทียบไป บัตรประชาชนซึ่งมีได้ใบเดียว
         * จึงงอกใบที่สองได้ถ้าผู้ใช้เข้ามาทางปฏิทินแทนที่จะเป็นทางรูป
         * — กติกาที่บังคับแค่บางทางเข้า คือกติกาที่ไม่มีอยู่จริง
         */
        const handledByDate = await handleExisting({
          replyToken: ev.replyToken, userId, typeKey: key,
          label: pending.label, expiryDate: picked, today,
        });
        if (handledByDate) {
          await repo.setPending(userId, null);
          return;
        }
        doc = await repo.createDocument({
          lineUserId: userId, docTypeKey: key, label: pending.label, expiryDate: picked, confirmed: true, source: 'manual',
        });
      }
      if (!doc) return reply(ev.replyToken, M.fallback());

      const rows = await repo.regenerateReminders(doc, today);
      const count = await repo.countDocuments(userId);
      const ownedNow = await repo.listDocTypeKeys(userId);
      await repo.setPending(userId, null);
      await repo.track('doc_confirmed', userId, { typeKey: doc.doc_type, docCount: count, source: 'manual' });

      const urgentNow = await inlineDueToday({ userId, today, queued: rows, doc });
      return reply(ev.replyToken, [
        ...M.savedAndSuggestMore({
          typeKey: doc.doc_type, reminderDates: rows, docCount: count, today,
          expiry: doc.expiry_date, ownedTypeKeys: ownedNow,
        }),
        ...urgentNow,
      ]);
    }

    /* ---- เลือกประเภทเอกสารจากชิป ---- */
    case 'type': {
      if (!typeKey) return;
      const t = docType(typeKey);
      const pendingType = await repo.getPending(userId);

      // เราอ่านวันที่จากรูปได้แล้ว ขาดแค่ประเภท — พอเขาตอบก็จบเลย
      // ไม่ต้องให้ถ่ายรูปใหม่หรือเลือกวันที่ซ้ำ
      if (pendingType.expiryDate && isISODate(pendingType.expiryDate)) {
        const handledByType = await handleExisting({
          replyToken: ev.replyToken, userId, typeKey,
          label: pendingType.label, expiryDate: pendingType.expiryDate, today,
        });
        if (handledByType) return;

        const doc = await repo.createDocument({
          lineUserId: userId,
          docTypeKey: typeKey,
          label: pendingType.label ?? null,
          expiryDate: pendingType.expiryDate,
          confirmed: false,
          source: 'ocr',
          meta: { type_from_user: true },
        });
        await repo.setPending(userId, null);
        return reply(
          ev.replyToken,
          M.confirmExtracted({ documentId: doc.id, typeKey, label: doc.label, expiry: doc.expiry_date, today })
        );
      }
      await repo.setPending(userId, { awaiting: t.ocr ? 'image' : 'date', docTypeKey: typeKey, at: new Date().toISOString() });
      if (!t.ocr) return reply(ev.replyToken, M.askDate({ typeKey, reason: 'manual' }));
      return reply(ev.replyToken, M.askPhotoFor(typeKey));
    }

    /* ---- ตอบว่าเป็นการต่ออายุใบเดิม ---- */
    case 'renew_existing': {
      const pend = await repo.getPending(userId);
      const target = docId ?? pend.documentId;
      if (!target || !pend.expiryDate || !isISODate(pend.expiryDate)) return reply(ev.replyToken, M.fallback());
      const doc = await repo.getDocument(target);
      if (!doc) return reply(ev.replyToken, M.fallback());

      const from = doc.expiry_date;
      await repo.updateDocument(doc.id, {
        expiry_date: pend.expiryDate,
        label: doc.label ?? pend.label ?? null,
        renewed_count: doc.renewed_count + 1,
        confirmed_by_user: true,
      });
      const fresh = await repo.getDocument(doc.id);
      const rows = fresh ? await repo.regenerateReminders(fresh, today) : [];
      await repo.setPending(userId, null);
      await repo.track('renewed_by_new_copy', userId, { typeKey: doc.doc_type, from, to: pend.expiryDate, via: 'asked' });
      return reply(
        ev.replyToken,
        M.renewedFromNewCopy({
          documentId: doc.id, typeKey: doc.doc_type, label: doc.label,
          from, to: pend.expiryDate, reminderDates: rows, today,
        })
      );
    }

    /* ---- ตอบว่าครั้งก่อนอ่านผิด — แก้วัน แต่ไม่นับเป็นการต่ออายุ ---- */
    case 'fix_date': {
      const pend = await repo.getPending(userId);
      const target = docId ?? pend.documentId;
      if (!target || !pend.expiryDate || !isISODate(pend.expiryDate)) return reply(ev.replyToken, M.fallback());
      const doc = await repo.getDocument(target);
      if (!doc) return reply(ev.replyToken, M.fallback());

      const from = doc.expiry_date;
      await repo.updateDocument(doc.id, { expiry_date: pend.expiryDate, confirmed_by_user: true });
      const fresh = await repo.getDocument(doc.id);
      const rows = fresh ? await repo.regenerateReminders(fresh, today) : [];
      await repo.setPending(userId, null);
      await repo.track('date_corrected', userId, { typeKey: doc.doc_type, from, to: pend.expiryDate, via: 'asked' });
      return reply(ev.replyToken, M.correctedDate({
        documentId: doc.id, typeKey: doc.doc_type, label: doc.label,
        from, to: pend.expiryDate, reminderDates: rows, today,
      }));
    }

    /* ---- ตอบว่าเป็นคนละใบ (รถอีกคัน) ---- */
    case 'as_new': {
      const pend = await repo.getPending(userId);
      if (!pend.docTypeKey || !pend.expiryDate || !isISODate(pend.expiryDate)) {
        return reply(ev.replyToken, M.fallback());
      }
      const created = await repo.createDocument({
        lineUserId: userId,
        docTypeKey: pend.docTypeKey,
        label: pend.label ?? null,
        expiryDate: pend.expiryDate,
        confirmed: false,
        source: 'ocr',
        meta: { kept_as_separate: true },
      });
      await repo.setPending(userId, null);
      await repo.track('kept_as_separate', userId, { typeKey: pend.docTypeKey });
      return reply(
        ev.replyToken,
        M.confirmExtracted({ documentId: created.id, typeKey: created.doc_type, label: created.label, expiry: created.expiry_date, today })
      );
    }

    /* ---- การ์ดรวมหลายใบ: ถามว่าต่อใบไหนไปแล้วบ้าง ---- */
    case 'renewed_pick': {
      const docs = await repo.listDocuments(userId);
      // เอาเฉพาะใบที่ใกล้ครบกำหนดจริง ไม่ใช่ทั้งรายการ
      const near = docs
        .filter((d) => d.confirmed_by_user)
        .map((d) => ({
          documentId: d.id, typeKey: d.doc_type, label: d.label,
          expiry: d.expiry_date, offsetDays: 0,
        }))
        .slice(0, 4);
      if (near.length === 0) return replyList(ev.replyToken);
      return reply(ev.replyToken, M.pickRenewed(near, today));
    }

    case 'manual':
      return reply(ev.replyToken, M.askType());

    /* ---- ฉาก 08 : "ต่อแล้ว" — เอกสารต่ออายุตัวเองในฐานข้อมูล ---- */
    case 'renewed': {
      if (!docId) return;
      const doc = await repo.getDocument(docId);
      if (!doc) return reply(ev.replyToken, M.fallback());

      const next = rolloverExpiry({ docTypeKey: doc.doc_type, currentExpiry: doc.expiry_date, today });
      if (!next) {
        // ไม่รู้อายุปกติของเอกสารประเภทนี้ ต้องถาม
        await repo.setPending(userId, { awaiting: 'date', documentId: doc.id, at: new Date().toISOString() });
        return reply(ev.replyToken, M.askDate({ documentId: doc.id, reason: 'edit' }));
      }

      await repo.updateDocument(doc.id, { expiry_date: next, renewed_count: doc.renewed_count + 1 });
      const fresh = await repo.getDocument(doc.id);
      const rowsAfterRenew = fresh ? await repo.regenerateReminders(fresh, today) : [];
      await repo.track('renewed_self', userId, { typeKey: doc.doc_type, newExpiry: next });

      return reply(ev.replyToken, M.rolledOver({
        documentId: doc.id, typeKey: doc.doc_type, label: doc.label, newExpiry: next,
        reminderDates: rowsAfterRenew, today,
      }));
    }

    case 'archive': {
      if (!docId) return;
      await repo.archiveDocument(docId);
      await repo.track('doc_archived', userId, { documentId: docId });
      return reply(ev.replyToken, M.archived());
    }

    /* ---- ฉาก 09 : ขา B — ที่เดียวที่เก็บเงินได้จริง ---- */
    case 'upsell': {
      const doc = docId ? await repo.getDocument(docId) : null;
      await repo.track('upsell_clicked', userId, { typeKey: doc?.doc_type ?? null, documentId: docId });
      return reply(ev.replyToken, M.upsellIntro(doc?.doc_type ?? 'vehicle_tax'));
    }

    case 'upsell_start': {
      await repo.track('upsell_started', userId, { typeKey });
      return reply(ev.replyToken, M.toHuman());
    }

    case 'list':
      return replyList(ev.replyToken);

    case 'human':
      await repo.track('to_human', userId);
      return reply(ev.replyToken, M.toHuman());

    case 'delete_confirm':
      await repo.hardDeleteUser(userId);
      await repo.track('data_deleted', userId);
      return reply(ev.replyToken, M.deleted());

    case 'later':
      return reply(ev.replyToken, [{ type: 'text', text: 'ได้ครับ ส่งมาเมื่อไหร่ก็ได้ 👍' }]);

    case 'cancel':
      return reply(ev.replyToken, [{ type: 'text', text: 'ยกเลิกแล้วครับ' }]);

    default:
      return reply(ev.replyToken, M.fallback());
  }
}

/**
 * เอกสารใหม่ตรงกับใบไหนที่มีอยู่ — จัดการให้ครบทั้ง 4 กรณีในที่เดียว
 * คืน true ถ้าจัดการจบแล้ว (ตอบผู้ใช้ไปแล้ว) / false ถ้าให้สร้างใบใหม่ต่อได้
 */
async function handleExisting(args: {
  replyToken: string;
  userId: string;
  typeKey: string;
  label?: string | null;
  expiryDate: string;
  today: string;
}): Promise<boolean> {
  const { kind, doc, reason } = await repo.resolveExisting({
    lineUserId: args.userId,
    docTypeKey: args.typeKey,
    label: args.label,
    expiryDate: args.expiryDate,
  });

  if (kind === 'none' || !doc) return false;

  if (kind === 'duplicate') {
    await repo.setPending(args.userId, null);
    await repo.track('duplicate_skipped', args.userId, { typeKey: args.typeKey });
    await reply(args.replyToken, M.alreadyHave(doc.doc_type, doc.label, doc.expiry_date));
    return true;
  }

  if (kind === 'renewal' || kind === 'correction') {
    const from = doc.expiry_date;
    await repo.updateDocument(doc.id, {
      expiry_date: args.expiryDate,
      label: doc.label ?? args.label ?? null,
      // นับเป็นการต่ออายุเฉพาะตอนที่เป็นการต่ออายุจริง
      // การแก้วันที่ที่อ่านผิดต้องไม่ไปโป่งตัวเลขของร้าน
      ...(kind === 'renewal' ? { renewed_count: doc.renewed_count + 1 } : {}),
      confirmed_by_user: true,
    });
    const fresh = await repo.getDocument(doc.id);
    const rows = fresh ? await repo.regenerateReminders(fresh, args.today) : [];
    await repo.setPending(args.userId, null);

    if (kind === 'renewal') {
      await repo.track('renewed_by_new_copy', args.userId, { typeKey: args.typeKey, from, to: args.expiryDate });
      await reply(args.replyToken, M.renewedFromNewCopy({
        documentId: doc.id, typeKey: doc.doc_type, label: doc.label ?? args.label,
        from, to: args.expiryDate, reminderDates: rows, today: args.today,
      }));
    } else {
      await repo.track('date_corrected', args.userId, { typeKey: args.typeKey, from, to: args.expiryDate });
      await reply(args.replyToken, M.correctedDate({
        documentId: doc.id, typeKey: doc.doc_type, label: doc.label ?? args.label,
        from, to: args.expiryDate, reminderDates: rows, today: args.today,
      }));
    }
    return true;
  }

  // ambiguous — ห้ามเดา ถามผู้ใช้ แล้วเก็บของใหม่ไว้ใน pending
  await repo.setPending(args.userId, {
    awaiting: 'type',
    docTypeKey: args.typeKey,
    documentId: doc.id,
    expiryDate: args.expiryDate,
    label: args.label ?? undefined,
    at: new Date().toISOString(),
  });
  await repo.track('renewal_ambiguous', args.userId, { typeKey: args.typeKey });
  await reply(
    args.replyToken,
    M.askRenewalOrNew({
      typeKey: args.typeKey,
      existingId: doc.id,
      existingLabel: doc.label,
      existingExpiry: doc.expiry_date,
      newExpiry: args.expiryDate,
      reason,
    })
  );
  return true;
}

/**
 * เอกสารที่เพิ่งบันทึกแล้วถึงกำหนดเตือนวันนี้เลย
 *
 * ไม่ต้องรอ cron รอบถัดไป เพราะผู้ใช้อยู่ในแชทกับเราตอนนี้
 * — รอไปอีกครึ่งวันแล้วค่อยเตือนเรื่องที่เขาเพิ่งพิมพ์เองเมื่อกี้ มันแปลก
 *
 * และส่งไปกับ reply ที่กำลังจะส่งอยู่แล้ว จึงไม่เสีย ฿0.06
 * ต่างจากการให้ cron ยิง push ทีหลัง
 */
async function inlineDueToday(args: {
  userId: string;
  today: string;
  queued: Array<{ id: string; send_on: string; offset_days: number; kind: string; document_id: string }>;
  doc: repo.DocumentRow;
}): Promise<M.LineMessage[]> {
  const dueNow = args.queued.filter((r) => r.kind === 'upcoming' && r.send_on <= args.today);
  if (dueNow.length === 0) return [];

  const actionsByType = await loadRenewActions();
  const msgs = M.upcomingReminder(
    [{
      documentId: args.doc.id,
      typeKey: args.doc.doc_type,
      label: args.doc.label,
      expiry: args.doc.expiry_date,
      offsetDays: dueNow[0].offset_days,
    }],
    args.today,
    actionsByType
  );

  // ปิดคิวทิ้ง ไม่งั้น cron พรุ่งนี้จะส่งซ้ำ และครั้งนั้นเสียเงิน
  await repo.markRemindersSent(dueNow.map((r) => r.id));
  await repo.track('reminder_sent_inline', args.userId, {
    typeKey: args.doc.doc_type, count: dueNow.length, cost_thb: 0,
  });
  return msgs;
}

function replyList(replyToken: string) {
  return reply(replyToken, M.listLink(env.liffUrl));
}
