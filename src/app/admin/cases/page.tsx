'use client';

import { useMemo, useState } from 'react';
import { Shell, Gate, useAdmin, UserId } from '../Shell';
import { STATUS_TH } from '@/lib/domain/caseWork';
import { ago } from '@/lib/domain/thaiDate';

interface CaseRow {
  id: string; status: string; service: string; serviceLabel: string;
  name: string | null; lineUserId: string; openedOn: string; atThai: string;
  idleDays: number; assigneeName: string | null;
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
 * ตัวกรองที่คนใช้จริงเลือกก่อนเสมอ คือ "อะไรยังไม่จบ"
 * จึงเป็นค่าเริ่มต้น ไม่ใช่ "ทั้งหมด" ที่ต้องมานั่งกรองเองทุกครั้งที่เปิดหน้า
 */
const FILTERS = [
  { key: 'open', label: 'ยังไม่จบ' },
  { key: 'new', label: 'ใหม่' },
  { key: 'in_progress', label: 'กำลังทำ' },
  { key: 'done', label: 'เสร็จ' },
  { key: 'cancelled', label: 'ยกเลิก' },
  { key: 'all', label: 'ทั้งหมด' },
];

/** ไม่มีใครแตะเกินหนึ่งสัปดาห์ = เคสที่กำลังจะถูกลืม */
const IDLE_WARN = 7;

export default function Cases() {
  const { state, message, data, busy, flash, act, post, reload } =
    useAdmin<Payload>('/api/admin/cases');
  const [opening, setOpening] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Array<{ line_user_id: string; display_name: string | null }> | null>(null);
  const [picked, setPicked] = useState<{ id: string; name: string | null } | null>(null);
  const [service, setService] = useState('cmi');
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState('open');
  const [term, setTerm] = useState('');

  const all = data?.cases ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all.length, open: 0 };
    for (const x of all) {
      c[x.status] = (c[x.status] ?? 0) + 1;
      if (OPEN.includes(x.status)) c.open++;
    }
    return c;
  }, [all]);

  const shown = useMemo(() => {
    const t = term.trim().toLowerCase();
    return all
      .filter((c) => (filter === 'all' ? true : filter === 'open' ? OPEN.includes(c.status) : c.status === filter))
      // ค้นจากสิ่งที่คนจำได้จริง: ชื่อลูกค้า เรื่องที่ทำ และโน้ตที่ตัวเองพิมพ์ไว้
      .filter((c) => !t || [c.name, c.serviceLabel, c.note, c.assigneeName]
        .some((v) => v?.toLowerCase().includes(t)))
      // เคสที่ไม่มีใครแตะนานสุดอยู่บนสุด — บนสุดควรเป็นของที่กำลังจะหลุด
      .sort((a, b) => b.idleDays - a.idleDays);
  }, [all, filter, term]);

  if (state !== 'ready' || !data) return <Gate state={state} message={message} />;

  async function search() {
    const out = await post('/api/admin/cases', { find: q });
    if (out) setFound(out.found ?? []);
  }

  async function create() {
    if (!picked) return;
    const out = await act('/api/admin/cases', {
      lineUserId: picked.id, service, note: note.trim() || undefined,
    }, 'เปิดเคสแล้ว');
    if (out?.id) window.location.href = `/admin/cases/${out.id}`;
  }

  return (
    <Shell role={data.me.role} onRefresh={reload} busy={busy} flash={flash}>
      <h2>เคส ({counts.open} ชิ้นที่ยังไม่จบ)</h2>
      {message && <p className="warn">{message}</p>}

      <div className="acts">
        <button className="btn primary" onClick={() => setOpening(!opening)}>
          {opening ? 'ปิดฟอร์ม' : 'เปิดเคสใหม่'}
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
                  <UserId id={u.line_user_id} />
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

      {/* กรองกับค้นหาอยู่ติดกัน เพราะเป็นการหาของเหมือนกัน คนละวิธีเท่านั้น */}
      <div className="chips">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`chip ${filter === f.key ? 'on' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label} {counts[f.key] ?? 0}
          </button>
        ))}
      </div>
      <input
        className="search" value={term} onChange={(e) => setTerm(e.target.value)}
        placeholder="ค้นในรายการ — ชื่อลูกค้า เรื่องที่ทำ โน้ต หรือคนรับผิดชอบ"
      />

      {shown.length === 0 ? (
        <p className="muted">
          {term.trim() ? 'ไม่เจอเคสที่ตรงกับคำนี้' : 'ไม่มีเคสในกลุ่มนี้ครับ'}
        </p>
      ) : (
        <div className="rows">
          {shown.map((c) => (
            <a className="lead caselink" key={c.id} href={`/admin/cases/${c.id}`}>
              <div className="lead-top">
                <b>{c.name ?? 'ผู้ใช้'}</b>
                <span className={`pill ${c.status}`}>{STATUS_TH[c.status] ?? c.status}</span>
              </div>
              <div className="muted">
                {c.serviceLabel} · เปิดเคส {ago(c.openedOn)}
                {c.assigneeName ? ` · ${c.assigneeName}` : ' · ยังไม่มีคนรับ'}
                {data.seesMoney && c.priceThb != null && ` · ${c.priceThb} บาท`}
                {c.paid && ' · รับเงินแล้ว'}
              </div>
              {c.note && <div className="muted">{c.note}</div>}
              {OPEN.includes(c.status) && c.idleDays >= IDLE_WARN && (
                <span className="tagx warn">ไม่มีใครแตะมา {c.idleDays} วัน</span>
              )}
            </a>
          ))}
        </div>
      )}
    </Shell>
  );
}
