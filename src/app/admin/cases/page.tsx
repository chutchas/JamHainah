'use client';

import { useState } from 'react';
import { Shell, Gate, useAdmin } from '../Shell';
import { STATUS_TH } from '@/lib/domain/caseWork';

interface CaseRow {
  id: string; status: string; service: string; serviceLabel: string;
  name: string | null; lineUserId: string; atThai: string;
  note: string | null; priceThb: number | null; paid: boolean;
}
interface Payload {
  services: Array<{ key: string; label: string }>;
  seesMoney: boolean;
  cases: CaseRow[];
  me: { role: string };
}

const OPEN = ['new', 'accepted', 'in_progress'];

/**
 * เคส "ให้เราต่อให้" — ที่เดียวที่งานของลูกค้าถูกจดไว้
 *
 * ก่อนหน้านี้เคสเกิดได้ทางเดียวคือลูกค้ากดปุ่มในไลน์ แต่ลูกค้าจริงโทรมา
 * ทักมา หรือเจอกันหน้าร้าน — งานที่จดไม่ได้ คืองานที่หายไปเงียบ ๆ
 */
export default function Cases() {
  const { state, message, data, busy, act, post } = useAdmin<Payload>('/api/admin/cases');
  const [opening, setOpening] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Array<{ line_user_id: string; display_name: string | null }> | null>(null);
  const [picked, setPicked] = useState<{ id: string; name: string | null } | null>(null);
  const [service, setService] = useState('cmi');
  const [note, setNote] = useState('');
  const [showDone, setShowDone] = useState(false);

  if (state !== 'ready' || !data) return <Gate state={state} message={message} />;

  const open = data.cases.filter((c) => OPEN.includes(c.status));
  const closed = data.cases.filter((c) => !OPEN.includes(c.status));
  const shown = showDone ? closed : open;

  async function search() {
    const out = await post('/api/admin/cases', { find: q });
    if (out) setFound(out.found ?? []);
  }

  async function create() {
    if (!picked) return;
    const out = await act('/api/admin/cases', {
      lineUserId: picked.id, service, note: note.trim() || undefined,
    });
    if (out?.id) window.location.href = `/admin/cases/${out.id}`;
  }

  return (
    <Shell role={data.me.role}>
      <h2>เคส ({open.length} ชิ้นที่ยังไม่จบ)</h2>
      {message && <p className="warn">{message}</p>}

      <div className="acts">
        <button className="btn primary" onClick={() => setOpening(!opening)}>
          {opening ? 'ปิดฟอร์ม' : 'เปิดเคสใหม่'}
        </button>
        <button className="btn" onClick={() => setShowDone(!showDone)}>
          {showDone ? `ดูที่ยังไม่จบ (${open.length})` : `ดูที่ปิดแล้ว (${closed.length})`}
        </button>
      </div>

      {opening && (
        <div className="lead formcard">
          <h3>เปิดเคสใหม่</h3>
          <p className="muted">
            ลูกค้าต้องเคยทักบอทมาก่อน ไม่งั้นเราส่งอะไรกลับไปหาเขาไม่ได้เลย
          </p>

          <div className="addrow">
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาลูกค้าจากชื่อ หรือรหัส U…"
              onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
            />
            <button className="btn" disabled={busy || !q.trim()} onClick={search}>ค้นหา</button>
          </div>

          {found && found.length === 0 && <p className="muted">ไม่เจอใครที่ตรงกับคำนี้</p>}
          {found && found.length > 0 && (
            <div className="picklist">
              {found.map((u) => (
                <button
                  key={u.line_user_id}
                  className={`pickrow ${picked?.id === u.line_user_id ? 'on' : ''}`}
                  onClick={() => setPicked({ id: u.line_user_id, name: u.display_name })}
                >
                  <b>{u.display_name ?? 'ไม่มีชื่อ'}</b>
                  <code>{u.line_user_id}</code>
                </button>
              ))}
            </div>
          )}

          {picked && (
            <>
              <p className="note left ok">เปิดเคสให้ {picked.name ?? 'ผู้ใช้'}</p>
              <div className="addrow">
                <select value={service} onChange={(e) => setService(e.target.value)}>
                  {data.services.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
                <input
                  value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="จดไว้หน่อยว่าคุยอะไรกัน (ใส่หรือไม่ใส่ก็ได้)"
                />
                <button className="btn primary" disabled={busy} onClick={create}>เปิดเคส</button>
              </div>
            </>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="muted">{showDone ? 'ยังไม่มีเคสที่ปิดแล้ว' : 'ไม่มีเคสค้างครับ'}</p>
      ) : (
        <div className="rows">
          {shown.map((c) => (
            <a className="lead caselink" key={c.id} href={`/admin/cases/${c.id}`}>
              <div className="lead-top">
                <b>{c.name ?? 'ผู้ใช้'}</b>
                <span className={`pill ${c.status}`}>{STATUS_TH[c.status] ?? c.status}</span>
              </div>
              <div className="muted">
                {c.serviceLabel} · เปิดเคส {c.atThai}
                {data.seesMoney && c.priceThb != null && ` · ${c.priceThb} บาท`}
                {c.paid && ' · รับเงินแล้ว'}
              </div>
              {c.note && <div className="muted">{c.note}</div>}
            </a>
          ))}
        </div>
      )}
    </Shell>
  );
}
