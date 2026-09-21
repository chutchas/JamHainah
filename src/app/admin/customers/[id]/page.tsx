'use client';

import { use, useState } from 'react';
import { Shell, Gate, useAdmin, UserId } from '../../Shell';
import { SERVICES, SERVICE_TH, STATUS_TH } from '@/lib/domain/caseWork';
import { ago, formatThai } from '@/lib/domain/thaiDate';

interface Reminder {
  id: string; on: string; onThai: string; kind: string;
  status: string; statusLabel: string; error: string | null;
}
interface Doc {
  id: string; typeLabel: string; label: string | null;
  expiry: string; expiryThai: string; daysLeft: number;
  confirmed: boolean; sourceLabel: string; renewed: number; addedOn: string;
  reminders: Reminder[];
}
interface Payload {
  me: { role: string };
  today: string;
  customer: {
    lineUserId: string; name: string | null; followedOn: string;
    blocked: boolean; blockedOn: string | null; purgeOn: string | null;
  };
  overview: { docs: number; confirmed: number; archived: number; pending: number; failed: number; sent: number };
  documents: Doc[];
  cases: Array<{ id: string; status: string; serviceLabel: string; openedOn: string }>;
}

/** สีของสถานะคิว — ใช้ class ที่มีอยู่แล้วในห้องทำงาน */
const Q_CLASS: Record<string, string> = { pending: 'pending', sent: 'ok', skipped: 'off', failed: 'failed' };

function left(n: number): string {
  if (n < 0) return `หมดไปแล้ว ${-n} วัน`;
  if (n === 0) return 'หมดวันนี้';
  return `อีก ${n} วัน`;
}

export default function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { state, message, data, busy, flash, act, reload } =
    useAdmin<Payload>(`/api/admin/customers/${id}`);
  const [service, setService] = useState<string>('cmi');

  if (state !== 'ready' || !data) return <Gate state={state} message={message} />;
  const c = data.customer;
  const o = data.overview;

  async function openCase() {
    const out = await act('/api/admin/cases', { lineUserId: c.lineUserId, service }, 'เปิดเคสแล้ว');
    if (out?.id) window.location.href = `/admin/cases/${out.id}`;
  }

  return (
    <Shell role={data.me.role} onRefresh={reload} busy={busy} flash={flash}>
      <p className="note left"><a href="/admin/customers">← กลับไปรายชื่อลูกค้า</a></p>

      <h2>{c.name ?? 'ยังไม่รู้ชื่อ'}</h2>
      {message && <p className="warn">{message}</p>}

      <div className="lead">
        <div className="lead-top">
          <b>แอดเมื่อ {formatThai(c.followedOn)}</b>
          {c.blocked
            ? <span className="pill cancelled">บล็อกแล้ว</span>
            : <span className="pill accepted">ยังเป็นเพื่อนอยู่</span>}
        </div>
        {c.blocked && c.blockedOn && c.purgeOn && (
          <div className="muted">
            บล็อกเมื่อ {formatThai(c.blockedOn)} — ข้อมูลจะถูกลบถาวร {formatThai(c.purgeOn)} ถ้าเขาไม่กลับมาแอดใหม่
          </div>
        )}
        <UserId id={c.lineUserId} />
      </div>

      <div className="tiles">
        <div className="tile"><span className="n">{o.docs}</span><span className="l">เอกสาร</span></div>
        <div className={`tile ${o.docs - o.confirmed > 0 ? 'bad' : ''}`}>
          <span className="n">{o.docs - o.confirmed}</span><span className="l">ยังไม่ยืนยัน</span>
        </div>
        <div className="tile"><span className="n">{o.pending}</span><span className="l">การเตือนที่รอส่ง</span></div>
        <div className="tile"><span className="n">{o.sent}</span><span className="l">เตือนไปแล้ว</span></div>
        <div className={`tile ${o.failed > 0 ? 'bad' : ''}`}>
          <span className="n">{o.failed}</span><span className="l">ส่งไม่ออก</span>
        </div>
      </div>

      <h2>เอกสาร</h2>
      <p className="note left">
        ดูอย่างเดียว — ถ้าข้อมูลผิด ให้ลูกค้าแก้เองในหน้า &ldquo;เอกสารของฉัน&rdquo;
        {o.archived > 0 && ` · ลูกค้าบอกว่าเลิกใช้แล้ว ${o.archived} ใบ (ไม่แสดง)`}
      </p>
      {data.documents.length === 0 ? (
        <p className="muted">ยังไม่ได้บันทึกเอกสารเลย</p>
      ) : (
        <div className="rows">
          {data.documents.map((d) => (
            <div className="lead" key={d.id}>
              <div className="lead-top">
                <b>{d.typeLabel}{d.label ? ` · ${d.label}` : ''}</b>
                <span className={`pill ${d.daysLeft < 0 ? 'cancelled' : d.daysLeft <= 30 ? 'new' : 'accepted'}`}>
                  {left(d.daysLeft)}
                </span>
              </div>
              <div className="muted">
                หมดอายุ {d.expiryThai} · {d.sourceLabel} · บันทึก {ago(d.addedOn, data.today)}
                {d.renewed > 0 && ` · ต่อมาแล้ว ${d.renewed} รอบ`}
              </div>
              {!d.confirmed && (
                <span className="tagx warn">ยังไม่กด &ldquo;ถูกต้อง&rdquo; — ใบนี้จะไม่ถูกเตือน</span>
              )}
              {d.reminders.length > 0 && (
                <div className="stuck">
                  {d.reminders.map((r) => (
                    <div className="stuckrow" key={r.id}>
                      <span className="what">{r.onThai}</span>
                      <span className="when">{r.kind === 'due' ? 'ครบกำหนดแล้ว' : 'ใกล้ครบกำหนด'}</span>
                      <span className={`tagx ${Q_CLASS[r.status] ?? ''}`}>{r.statusLabel}</span>
                      {r.error && <span className="why">{r.error}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <h2>เคส</h2>
      {data.cases.length > 0 && (
        <div className="rows">
          {data.cases.map((k) => (
            <a className="lead caselink" key={k.id} href={`/admin/cases/${k.id}`}>
              <div className="lead-top">
                <b>{k.serviceLabel}</b>
                <span className={`pill ${k.status}`}>{STATUS_TH[k.status] ?? k.status}</span>
              </div>
              <div className="muted">เปิดเคส {ago(k.openedOn, data.today)}</div>
            </a>
          ))}
        </div>
      )}
      {!c.blocked && (
        <div className="addrow">
          <select value={service} onChange={(e) => setService(e.target.value)}>
            {SERVICES.map((s) => <option key={s} value={s}>{SERVICE_TH[s]}</option>)}
          </select>
          <button className="btn primary" disabled={busy} onClick={openCase}>เปิดเคสให้คนนี้</button>
        </div>
      )}
    </Shell>
  );
}
