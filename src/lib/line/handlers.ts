/**
 * ตัวจัดการ event ทั้งหมดจาก LINE
 *
 * ⚠️ ทุกฟังก์ชันในไฟล์นี้ตอบด้วย reply() เท่านั้น (ฟรี)
 *    ห้าม import push จากที่นี่ — มี test บังคับไว้
 */
import { reply, getProfile, getMessageContent, showLoading } from './client';
import * as M from './messages';
import { ocr, CONFIDENCE_FLOOR } from '@/lib/ocr';
import { docType } from '@/lib/domain/docTypes';
import { isISODate, todayInBangkok } from '@/lib/domain/thaiDate';
import { env } from '@/lib/env';
import { rolloverExpiry } from '@/lib/domain/reminders';
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

  if (msg?.type === 'image') return onImage(ev, userId, msg.id);

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
    await repo.track('text_unmatched', userId, { text: t.slice(0, 200) });
    return reply(ev.replyToken, M.fallback());
  }

  return reply(ev.replyToken, M.fallback());
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

  const typeKey = extraction.docTypeKey ?? pending.docTypeKey ?? null;

  // ไม่รู้ว่าเอกสารอะไร — ถามผู้ใช้ ห้ามยัดลง "อื่น ๆ" แล้วเดาจังหวะเตือนเอง
  // แต่เก็บวันที่กับชื่อที่อ่านได้ไว้ก่อน จะได้ไม่ต้องให้เขาทำซ้ำ
  if (!typeKey) {
    await repo.track('ocr_type_unknown', userId, { label: extraction.label });
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
    await repo.track('ocr_miss', userId, { confidence: extraction.confidence, typeKey });
    await repo.setPending(userId, { awaiting: 'date', docTypeKey: typeKey, at: new Date().toISOString() });
    return reply(ev.replyToken, M.askDate({ typeKey, reason: 'ocr_miss' }));
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
    source: 'ocr',
    meta: { ocr_confidence: extraction.confidence },
  });

  await repo.setPending(userId, null);
  await repo.track('ocr_hit', userId, { typeKey, confidence: extraction.confidence });

  return reply(
    ev.replyToken,
    M.confirmExtracted({ documentId: doc.id, typeKey, label: doc.label, expiry: doc.expiry_date, today })
  );
}

/* ---------------- ปุ่มทั้งหมด ---------------- */

async function onPostback(ev: Ev, userId: string) {
  await repo.upsertUser(userId);
  const params = new URLSearchParams(ev.postback?.data ?? '');
  const action = params.get('a');
  const docId = params.get('d');
  const typeKey = params.get('k');
  const today = todayInBangkok();

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

      return reply(ev.replyToken, M.savedAndSuggestMore({
        typeKey: doc.doc_type, reminderDates: rows, docCount: count, today, ownedTypeKeys: owned,
      }));
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
        doc = await repo.createDocument({
          lineUserId: userId, docTypeKey: key, expiryDate: picked, confirmed: true, source: 'manual',
        });
      }
      if (!doc) return reply(ev.replyToken, M.fallback());

      const rows = await repo.regenerateReminders(doc, today);
      const count = await repo.countDocuments(userId);
      const ownedNow = await repo.listDocTypeKeys(userId);
      await repo.setPending(userId, null);
      await repo.track('doc_confirmed', userId, { typeKey: doc.doc_type, docCount: count, source: 'manual' });

      return reply(ev.replyToken, M.savedAndSuggestMore({
        typeKey: doc.doc_type, reminderDates: rows, docCount: count, today, ownedTypeKeys: ownedNow,
      }));
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
      return reply(ev.replyToken, [
        {
          type: 'text',
          text: `ได้ครับ ${t.emoji} ${t.label}\n${t.hint ?? 'ถ่ายรูปหน้าที่มีวันหมดอายุมาได้เลย'}`,
          quickReply: {
            items: [
              { type: 'action', action: { type: 'camera', label: '📸 ถ่ายรูป' } },
              { type: 'action', action: { type: 'datetimepicker', label: '📅 พิมพ์วันที่เอง', data: M.pb('setdate', { k: typeKey }), mode: 'date' } },
            ],
          },
        },
      ]);
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
        M.renewedFromNewCopy({ typeKey: doc.doc_type, label: doc.label, from, to: pend.expiryDate, reminderDates: rows })
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
        typeKey: doc.doc_type, label: doc.label, from, to: pend.expiryDate, reminderDates: rows,
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
      if (fresh) await repo.regenerateReminders(fresh, today);
      await repo.track('renewed_self', userId, { typeKey: doc.doc_type, newExpiry: next });

      return reply(ev.replyToken, M.rolledOver(doc.doc_type, doc.label, next));
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
        typeKey: doc.doc_type, label: doc.label ?? args.label, from, to: args.expiryDate, reminderDates: rows,
      }));
    } else {
      await repo.track('date_corrected', args.userId, { typeKey: args.typeKey, from, to: args.expiryDate });
      await reply(args.replyToken, M.correctedDate({
        typeKey: doc.doc_type, label: doc.label ?? args.label, from, to: args.expiryDate, reminderDates: rows,
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

function replyList(replyToken: string) {
  return reply(replyToken, M.listLink(env.liffUrl));
}
