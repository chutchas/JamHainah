'use client';

import { Shell, Gate, useAdmin, UserId } from './Shell';
import type { Summary } from './types';
import { ago } from '@/lib/domain/thaiDate';

/**
 * หน้าสรุป — ตอบคำถามเดียว: "วันนี้ต้องลงมือทำอะไรไหม"
 *
 * ไม่มีปุ่มเปลี่ยนสถานะอยู่ที่นี่แล้ว ย้ายไปอยู่ในหน้าเคสที่เดียว
 * เมื่อก่อนเปลี่ยนได้สองที่ ซึ่งแปลว่ามีสองที่ที่ต้องดูแลให้ตรงกัน
 * และคนในทีมต้องจำเองว่าเมื่อกี้ตัวเองกดที่ไหน
 *
 * เรียงตามความเร่ง: ของที่ต้องลงมืออยู่บนสุด ตัวเลขที่ดูวันละครั้งอยู่ล่าง
 */
export default function AdminHome() {
  const { state, message, data, busy, flash, reload } = useAdmin<Summary>('/api/admin/summary');
  if (state !== 'ready' || !data) return <Gate state={state} message={message} />;

  const { overview, reminders, reading, leads, orders, me } = data;
  const open = orders.filter((o) => ['new', 'accepted', 'in_progress'].includes(o.status));
  const fresh = open.filter((o) => o.status === 'new').length;
  const last = reminders.lastCron;
  const lastAt = last ? new Date(last.at) : null;
  // เกิน 26 ชั่วโมง = ข้ามรอบเช้าไปแล้วอย่างน้อยหนึ่งรอบ (เผื่อเวลารันคลาดเคลื่อน)
  const stale = lastAt ? Date.now() - lastAt.getTime() > 26 * 3600_000 : true;
  const stuck = reminders.failedQueue;
  const quiet = open.length === 0 && stuck === 0 && !stale;

  return (
    <Shell role={me.role} onRefresh={reload} busy={busy} flash={flash}>
      <h2>ต้องลงมือ</h2>
      {quiet && <p className="muted">ไม่มีอะไรค้างครับ — คิวว่าง รอบเตือนเดินปกติ</p>}

      {/*
        สามช่องนี้กดได้ เพราะทุกช่องมีที่ให้ไปทำต่อ
        ตัวเลขที่กดไม่ได้ ทำให้คนต้องไล่หาเองว่าของอยู่หน้าไหน
      */}
      <div className="tiles">
        <a className={`tile ${fresh > 0 ? 'bad' : ''}`} href="/admin/cases">
          <span className="n">{open.length}</span>
          <span className="l">เคสที่ยังไม่จบ{fresh > 0 ? ` · ใหม่ ${fresh}` : ''}</span>
        </a>
        <a className={`tile ${stuck > 0 ? 'bad' : ''}`} href="/admin/reminders">
          <span className="n">{stuck}</span>
          <span className="l">เตือนที่ส่งไม่ออก</span>
        </a>
        <div className={`tile ${stale ? 'bad' : ''}`}>
          <span className="n">{lastAt ? ago(lastAt.toISOString().slice(0, 10)) : '—'}</span>
          <span className="l">รอบเตือนล่าสุด</span>
        </div>
      </div>
      {stale && <p className="warn">รอบเตือนไม่ได้รันมาเกิน 26 ชั่วโมง — ต้องดู log ที่ Vercel</p>}
      {last && (
        <p className="note left">
          รอบล่าสุด: ส่ง {last.messages ?? 0} ข้อความ · {last.users ?? 0} คน ·
          ล้มเหลว {last.failed ?? 0}
          {me.seesMoney && ` · ค่าข้อความ ${last.estimated_cost_thb ?? 0} บาท`}
        </p>
      )}

      <h2>คนที่สนใจให้เราต่อให้ ({leads.length} ครั้งใน 30 วัน)</h2>
      {leads.length === 0 ? (
        <p className="muted">ยังไม่มีใครกด &ldquo;ให้เราต่อให้&rdquo;</p>
      ) : (
        <div className="rows">
          {leads.map((l, i) => (
            <div className="lead" key={`${l.at}-${i}`}>
              <div className="lead-top">
                <b>{l.name ?? 'ผู้ใช้'}</b>
                <span className="muted">{ago(l.at.slice(0, 10))}</span>
              </div>
              <div className="muted">
                {l.typeLabel} · {l.via === 'liff' || l.via === 'web' ? 'จากหน้าเว็บ' : 'จากแชท'}
                {l.started ? ' · ให้ข้อมูลแล้ว' : ''}
              </div>
              <UserId id={l.lineUserId} />
            </div>
          ))}
        </div>
      )}
      <p className="note left">
        รายการนี้คือคนที่กดปุ่ม ยังไม่ใช่งานที่รับแล้ว — เปิดเคสให้เขาได้ที่แท็บเคส
      </p>

      <h2>การอ่านเอกสาร (30 วัน)</h2>
      <div className="tiles">
        <div className="tile">
          <span className="n">{reading.accuracy === null ? '—' : `${reading.accuracy}%`}</span>
          <span className="l">อ่านถูกโดยไม่ถูกแก้</span>
        </div>
        <div className="tile"><span className="n">{reading.readOk}</span><span className="l">อ่านออก</span></div>
        <div className="tile"><span className="n">{reading.corrected}</span><span className="l">ผู้ใช้แก้วันที่</span></div>
        <div className="tile">
          <span className="n">{reading.missed + reading.ocrError}</span>
          <span className="l">อ่านไม่ออก</span>
        </div>
        <div className={`tile ${reading.limitHit > 0 ? 'bad' : ''}`}>
          <span className="n">{reading.limitHit}</span>
          <span className="l">ชนเพดานรายวัน</span>
        </div>
      </div>

      <h2>ผู้ใช้</h2>
      <div className="tiles">
        <div className="tile"><span className="n">{overview.users}</span><span className="l">ผู้ใช้</span></div>
        <div className="tile"><span className="n">{overview.docs}</span><span className="l">เอกสาร</span></div>
        <div className="tile"><span className="n">{overview.docsPerUser}</span><span className="l">เอกสาร/คน</span></div>
        <div className="tile"><span className="n">{overview.confirmedPct}%</span><span className="l">ยืนยันแล้ว</span></div>
        <div className="tile"><span className="n">{overview.unfollowed}</span><span className="l">บล็อก/ลบเพื่อน</span></div>
      </div>
    </Shell>
  );
}
