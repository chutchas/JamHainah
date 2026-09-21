'use client';

import { useMemo, useState } from 'react';
import { Shell, Gate, useAdmin } from '../Shell';
import { ago, formatThai } from '@/lib/domain/thaiDate';

interface Customer {
  lineUserId: string; name: string | null; followedOn: string; blocked: boolean;
  docs: number; unconfirmed: number; nextExpiry: string | null; daysToNext: number | null;
  openCase: boolean;
}
interface Payload {
  me: { role: string };
  seesAll: boolean;
  today: string;
  customers: Customer[];
}

/** ใกล้หมดภายในกี่วัน ถึงนับว่า "ควรคุยตอนนี้" */
const SOON = 30;

/**
 * ตัวกรองเรียงตามคำถามที่ทีมถามบ่อยสุด:
 * ใครใกล้หมด (โอกาสรับงาน) → ใครยังไม่กดยืนยัน (จะไม่ได้การเตือน) → ใครแอดแล้วไม่ใช้
 */
const FILTERS: Array<{ key: string; label: string; test: (c: Customer) => boolean }> = [
  { key: 'all', label: 'ทั้งหมด', test: (c) => !c.blocked },
  { key: 'soon', label: `หมดใน ${SOON} วัน`, test: (c) => !c.blocked && c.daysToNext !== null && c.daysToNext <= SOON },
  { key: 'unconfirmed', label: 'ยังไม่ยืนยัน', test: (c) => !c.blocked && c.unconfirmed > 0 },
  { key: 'empty', label: 'ยังไม่บันทึก', test: (c) => !c.blocked && c.docs === 0 },
  { key: 'blocked', label: 'บล็อกแล้ว', test: (c) => c.blocked },
];

export default function Customers() {
  const { state, message, data, busy, flash, act, reload } = useAdmin<Payload>('/api/admin/customers');
  const [filter, setFilter] = useState('all');
  const [term, setTerm] = useState('');

  const all = data?.customers ?? [];
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, all.filter(f.test).length])),
    [all],
  );
  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0];
    const t = term.trim().toLowerCase();
    return all
      .filter(f.test)
      .filter((c) => !t || (c.name ?? '').toLowerCase().includes(t) || c.lineUserId.toLowerCase().includes(t))
      // ใบที่ใกล้หมดที่สุดขึ้นก่อน คนที่ไม่มีใบใกล้หมดเรียงตามวันที่แอดล่าสุด
      .sort((a, b) => (a.daysToNext ?? 1e9) - (b.daysToNext ?? 1e9) || b.followedOn.localeCompare(a.followedOn));
  }, [all, filter, term]);

  if (state !== 'ready' || !data) return <Gate state={state} message={message} />;

  return (
    <Shell role={data.me.role} onRefresh={reload} busy={busy} flash={flash}>
      <h2>ลูกค้า ({counts.all} คน)</h2>
      {message && <p className="warn">{message}</p>}
      {!data.seesAll && (
        <p className="note left">ระดับพนักงานเห็นเฉพาะลูกค้าที่มีเคสเปิดอยู่</p>
      )}
      {/* ปุ่มขึ้นเฉพาะตอนที่มีคนไม่มีชื่อจริง ๆ — ปุ่มที่กดแล้วไม่มีอะไรเกิดขึ้น ทำให้คนสงสัยว่าพัง */}
      {data.seesAll && all.some((c) => !c.name && !c.blocked) && (
        <div className="acts">
          <button
            className="btn" disabled={busy}
            onClick={() => act('/api/admin/customers', { op: 'fillNames' })}
          >
            ดึงชื่อจาก LINE ({all.filter((c) => !c.name && !c.blocked).length} คนที่ยังไม่มีชื่อ)
          </button>
        </div>
      )}

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
        placeholder="ค้นจากชื่อ หรือรหัส U…"
      />

      {shown.length === 0 ? (
        <p className="muted">{term.trim() ? 'ไม่เจอลูกค้าที่ตรงกับคำนี้' : 'ไม่มีลูกค้าในกลุ่มนี้ครับ'}</p>
      ) : (
        <div className="rows">
          {shown.map((c) => (
            <a className="lead caselink" key={c.lineUserId} href={`/admin/customers/${c.lineUserId}`}>
              <div className="lead-top">
                <b>{c.name ?? 'ยังไม่รู้ชื่อ'}</b>
                {c.blocked
                  ? <span className="pill cancelled">บล็อกแล้ว</span>
                  : <span className="pill accepted">{c.docs} ใบ</span>}
              </div>
              <div className="muted">
                แอดเมื่อ {ago(c.followedOn, data.today)}
                {c.nextExpiry && ` · ใบถัดไปหมด ${formatThai(c.nextExpiry)}`}
                {c.daysToNext !== null && (c.daysToNext === 0 ? ' (วันนี้)' : ` (อีก ${c.daysToNext} วัน)`)}
              </div>
              <div>
                {c.daysToNext !== null && c.daysToNext <= SOON && !c.blocked && (
                  <span className="tagx warn">ใกล้หมด</span>
                )}
                {c.unconfirmed > 0 && <span className="tagx pending">ยังไม่ยืนยัน {c.unconfirmed} ใบ</span>}
                {c.openCase && <span className="tagx ok">มีเคสเปิดอยู่</span>}
              </div>
            </a>
          ))}
        </div>
      )}
    </Shell>
  );
}
