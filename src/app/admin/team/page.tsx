'use client';

import { useEffect, useState } from 'react';
import { Shell, Gate, useAdmin, UserId } from '../Shell';
import type { Summary } from '../types';
import { ADMIN_ROLES, ROLE_TH, ROLE_WHAT, type AdminRole } from '@/lib/domain/roles';

interface AuditEntry {
  id: number; on: string; atThai: string; time: string;
  byName: string; what: string; target: string | null; orderId: string | null;
}

/**
 * ทีม — หน้าเดียวในห้องทำงานที่แตะสิทธิ์ของคนอื่น
 *
 * แยกออกมาจากหน้าสรุปโดยตั้งใจ: งานนี้ทำนาน ๆ ครั้ง แต่ผิดแล้วเจ็บ
 * การให้มันนั่งอยู่ท้ายหน้าที่เปิดดูทุกวัน คือการเชิญให้เผลอกด
 *
 * ประวัติการแก้ไขอยู่ท้ายหน้านี้ ไม่แยกเป็นแท็บใหม่ เพราะคนที่เปิดมาดูประวัติ
 * คือคนเดียวกับที่มาดูว่าตอนนี้ใครมีสิทธิ์อะไร — คำถามเดียวกันคนละมุม
 */
export default function Team() {
  const { state, message, data, busy, flash, act, reload } = useAdmin<Summary>('/api/admin/summary');
  const [newId, setNewId] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<AdminRole>('staff');
  const [log, setLog] = useState<AuditEntry[] | null>(null);

  const owner = data?.me.role === 'owner';

  useEffect(() => {
    if (!owner) return;
    let off = false;
    fetch('/api/admin/audit')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!off && j) setLog(j.entries ?? []); })
      .catch(() => {});
    return () => { off = true; };
    // โหลดใหม่ทุกครั้งที่ตารางทีมเปลี่ยน เพราะการเปลี่ยนนั้นเองก็เป็นบรรทัดใหม่ในประวัติ
  }, [owner, data]);

  if (state !== 'ready' || !data) return <Gate state={state} message={message} />;
  const { team, me } = data;

  return (
    <Shell role={me.role} onRefresh={reload} busy={busy} flash={flash}>
      <h2>ทีม ({team.filter((m) => !m.disabled).length} คนที่ใช้งานได้)</h2>
      {message && <p className="warn">{message}</p>}

      {!owner && (
        <p className="note left">
          คุณเป็น{ROLE_TH[me.role as AdminRole] ?? me.role} — ดูรายชื่อได้
          แต่เพิ่ม ถอด หรือเปลี่ยนระดับ ทำได้เฉพาะเจ้าของระบบ
        </p>
      )}

      <div className="rows">
        {team.length === 0 && (
          <p className="muted">
            ยังไม่มีใครในตาราง — ตอนนี้เข้าได้ด้วย ADMIN_LINE_USER_ID เท่านั้น
          </p>
        )}
        {team.map((m) => {
          const self = m.lineUserId === me.userId;
          return (
            <div className="lead" key={m.lineUserId}>
              <div className="lead-top">
                <b>{m.name ?? 'ไม่มีชื่อ'}</b>
                <span className={`pill ${m.disabled ? 'cancelled' : m.role === 'owner' ? 'accepted' : m.role === 'manager' ? 'in_progress' : ''}`}>
                  {m.disabled ? 'ถูกถอดสิทธิ์' : ROLE_TH[m.role as AdminRole] ?? m.role}
                </span>
              </div>
              {!m.disabled && <div className="muted">{ROLE_WHAT[m.role as AdminRole]}</div>}
              <UserId id={m.lineUserId} />

              {owner && !m.disabled && !self && (
                <div className="acts">
                  <select
                    value={m.role} disabled={busy}
                    onChange={(e) =>
                      act('/api/admin/team', { lineUserId: m.lineUserId, role: e.target.value },
                        `เปลี่ยนเป็น${ROLE_TH[e.target.value as AdminRole]}แล้ว`)
                    }
                  >
                    {ADMIN_ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_TH[r]}</option>
                    ))}
                  </select>
                  <button
                    className="btn danger" disabled={busy}
                    onClick={() => act('/api/admin/team',
                      { lineUserId: m.lineUserId, disable: true }, 'ถอดสิทธิ์แล้ว')}
                  >
                    ถอดสิทธิ์
                  </button>
                </div>
              )}
              {self && <div className="muted">นี่คือบัญชีของคุณเอง — เปลี่ยนระดับหรือถอดสิทธิ์ตัวเองไม่ได้</div>}
            </div>
          );
        })}
      </div>

      {owner && (
        <>
          <h2>เพิ่มคนเข้าทีม</h2>
          <div className="addrow">
            <input
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="LINE user id (ขึ้นต้นด้วย U ตามด้วยตัวอักษร 32 ตัว)"
              spellCheck={false}
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ชื่อที่จะให้แสดงในหน้านี้"
            />
            <select value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
              {ADMIN_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_TH[r]}</option>
              ))}
            </select>
            <button
              className="btn primary" disabled={busy || !/^U[0-9a-f]{32}$/.test(newId.trim())}
              onClick={() =>
                act('/api/admin/team', {
                  lineUserId: newId.trim(), role, displayName: name.trim() || undefined,
                }, 'เพิ่มเข้าทีมแล้ว').then(() => { setNewId(''); setName(''); })
              }
            >
              เพิ่มเข้าทีม
            </button>
            <p className="note left">{ROLE_WHAT[role]}</p>
          </div>
          <p className="note left">
            หารหัสได้จากตาราง users ใน Supabase — ให้เขาทักบอทก่อนหนึ่งครั้ง แล้วรหัสจะไปโผล่ที่นั่น
          </p>

          <h2>ประวัติการแก้ไข</h2>
          {log === null && <p className="muted">กำลังโหลด…</p>}
          {log?.length === 0 && <p className="muted">ยังไม่มีใครแก้อะไรเลย</p>}
          {log && log.length > 0 && (
            <div className="timeline">
              {log.map((e) => (
                <div className="tl" key={e.id}>
                  <span className="tl-when">{e.atThai} {e.time}</span>
                  <span className="tl-what">
                    {e.what}
                    {e.target && (
                      e.orderId
                        ? <> · <a href={`/admin/cases/${e.orderId}`}>{e.target}</a></>
                        : ` · ${e.target}`
                    )}
                  </span>
                  <span className="tl-who">{e.byName}</span>
                </div>
              ))}
            </div>
          )}
          <p className="note left">
            60 รายการล่าสุด — ประวัติทั้งหมดอยู่ในตาราง audit_log และลบจากหน้านี้ไม่ได้
          </p>
        </>
      )}
    </Shell>
  );
}
