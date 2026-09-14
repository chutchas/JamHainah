'use client';

import { Shell, Gate, useAdmin } from './Shell';
import type { Order, Summary } from './types';
import { STATUS_TH } from '@/lib/domain/caseWork';

/**
 * ห้องทำงาน หน้าสรุป — อ่านเป็นหลัก แตะได้เฉพาะสถานะงาน
 *
 * สิ่งที่หน้านี้ต้องตอบให้ได้ในสามวินาทีแรก เรียงตามความเร่ง:
 *   1. มีงานเข้าไหม (คนกด "ให้เราต่อให้")
 *   2. เมื่อเช้าเตือนออกไหม มีที่ส่งไม่ออกค้างอยู่ไหม
 *   3. โมเดลอ่านแม่นแค่ไหน
 * ตัวเลขโตช้าอย่างจำนวนผู้ใช้อยู่ล่างสุด เพราะดูวันละครั้งก็พอ
 *
 * เรื่องที่ต้องลงมือทำทีละรายการ (ยิงซ้ำ · เพิ่มถอดสิทธิ์) แยกไปคนละหน้า
 * หน้าที่ทำได้ทุกอย่างในหน้าเดียว คือหน้าที่หาอะไรไม่เจอสักอย่างตอนรีบ
 */
// ขั้นถัดไปของแต่ละสถานะ — ปุ่มที่เห็นต้องเป็นปุ่มที่กดแล้วมีความหมายตอนนี้
const NEXT: Partial<Record<Order['status'], Array<Order['status']>>> = {
  new: ['accepted', 'cancelled'],
  accepted: ['in_progress', 'cancelled'],
  in_progress: ['done', 'cancelled'],
};

export default function AdminHome() {
  const { state, message, data, busy, act } = useAdmin<Summary>('/api/admin/summary');
  if (state !== 'ready' || !data) return <Gate state={state} message={message} />;

  const { overview, reminders, reading, leads, orders } = data;
  const open = orders.filter((o) => ['new', 'accepted', 'in_progress'].includes(o.status));
  const last = reminders.lastCron;
  const lastAt = last ? new Date(last.at) : null;
  // เกิน 26 ชั่วโมง = ข้ามรอบเช้าไปแล้วอย่างน้อยหนึ่งรอบ (เผื่อเวลารันคลาดเคลื่อน)
  const stale = lastAt ? Date.now() - lastAt.getTime() > 26 * 3600_000 : true;
  const stuck = reminders.failedQueue;

  return (
    <Shell>
      <p className="note left">ข้อมูล ณ {new Date().toLocaleString('th-TH')}</p>
      {message && <p className="warn">{message}</p>}

      <div className="cols">
        <section>
          <h2>คิวงาน ({open.length} ชิ้นที่ยังไม่จบ)</h2>
          {open.length === 0 ? (
            <p className="muted">ไม่มีงานค้างครับ</p>
          ) : (
            <div className="rows">
              {open.map((o) => (
                <div className="lead" key={o.id}>
                  <div className="lead-top">
                    <b>{o.name ?? 'ผู้ใช้'}</b>
                    <span className={`pill ${o.status}`}>{STATUS_TH[o.status]}</span>
                  </div>
                  <div className="muted">
                    {o.service} · เปิดเคส {o.atThai}
                    {o.priceThb != null && ` · ${o.priceThb} บาท`}
                    {o.paid && ' · รับเงินแล้ว'}
                  </div>
                  {o.note && <div className="muted">{o.note}</div>}
                  <div className="acts">
                    {(NEXT[o.status] ?? []).map((next) => (
                      <button
                        key={next}
                        className={`btn ${next === 'cancelled' ? 'danger' : 'primary'}`}
                        disabled={busy}
                        onClick={() => act('/api/admin/order', { id: o.id, status: next })}
                      >
                        {STATUS_TH[next]}
                      </button>
                    ))}
                    {/* รายละเอียดทั้งหมดอยู่ในหน้าเคส หน้าสรุปโชว์แค่พอให้รู้ว่าต้องไปดู */}
                    <a className="btn" href={`/admin/cases/${o.id}`}>เปิดเคส</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2>งานเข้า ({leads.length} ครั้งใน 30 วัน)</h2>
          {leads.length === 0 ? (
            <p className="muted">ยังไม่มีใครกด &ldquo;ให้เราต่อให้&rdquo;</p>
          ) : (
            <div className="rows">
              {leads.map((l, i) => (
                <div className="lead" key={`${l.at}-${i}`}>
                  <div className="lead-top">
                    <b>{l.name ?? 'ผู้ใช้'}</b>
                    <span className="muted">{l.atThai}</span>
                  </div>
                  <div className="muted">
                    {l.typeLabel} · {l.via === 'liff' || l.via === 'web' ? 'จากหน้าเว็บ' : 'จากแชท'}
                    {l.started ? ' · ให้ข้อมูลแล้ว' : ''}
                  </div>
                  <code>{l.lineUserId}</code>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <h2>การเตือน</h2>
      <div className="tiles">
        <div className={`tile ${stale ? 'bad' : ''}`}>
          <span className="n">{lastAt ? lastAt.toLocaleDateString('th-TH') : '—'}</span>
          <span className="l">รอบเตือนล่าสุด</span>
        </div>
        <div className={`tile ${stuck > 0 ? 'bad' : ''}`}>
          <span className="n">{stuck}</span>
          <span className="l">ส่งไม่ออก (ค้าง)</span>
        </div>
        <div className="tile">
          <span className="n">{reminders.pendingToday}</span>
          <span className="l">คิวถึงกำหนดวันนี้</span>
        </div>
        <div className="tile">
          <span className="n">{reminders.sentWeek}</span>
          <span className="l">ส่งแล้วใน 7 วัน</span>
        </div>
      </div>
      {last && (
        <p className="note left">
          รอบล่าสุด: ส่ง {last.messages ?? 0} ข้อความ · {last.users ?? 0} คน ·
          ล้มเหลว {last.failed ?? 0} · ค่าข้อความ {last.estimated_cost_thb ?? 0} บาท
        </p>
      )}
      {stale && <p className="warn">รอบเตือนไม่ได้รันมาเกิน 26 ชั่วโมง — ต้องดู log ที่ Vercel</p>}
      {stuck > 0 && (
        <p className="acts"><a className="pill go" href="/admin/reminders">ดูรายการค้าง {stuck} รายการ</a></p>
      )}

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
        <div className="tile"><span className="n">{reading.aiCalls}</span><span className="l">เรียก AI</span></div>
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

      <p className="note left">
        ข้อมูลลูกค้าแก้ที่ Supabase — หน้านี้แก้ได้เฉพาะสถานะงาน
        และทุกการเปลี่ยนแปลงถูกบันทึกว่าใครทำ
      </p>
    </Shell>
  );
}
