'use client';

import { useState } from 'react';
import { Shell, Gate, useAdmin } from '../Shell';
import type { Summary } from '../types';
import { ADMIN_ROLES, ROLE_TH, ROLE_WHAT, type AdminRole } from '@/lib/domain/roles';

/**
 * ทีม — หน้าเดียวในห้องทำงานที่แตะสิทธิ์ของคนอื่น
 *
 * แยกออกมาจากหน้าสรุปโดยตั้งใจ: งานนี้ทำนาน ๆ ครั้ง แต่ผิดแล้วเจ็บ
 * การให้มันนั่งอยู่ท้ายหน้าที่เปิดดูทุกวัน คือการเชิญให้เผลอกด
 */
export default function Team() {
  const { state, message, data, busy, act } = useAdmin<Summary>('/api/admin/summary');
  const [newId, setNewId] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<AdminRole>('staff');

  if (state !== 'ready' || !data) return <Gate state={state} message={message} />;
  const { team, me } = data;
  const owner = me.role === 'owner';

  return (
    <Shell>
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
              {!m.disabled && (
                <div className="muted">{ROLE_WHAT[m.role as AdminRole]}</div>
              )}
              <code>{m.lineUserId}</code>

              {owner && !m.disabled && !self && (
                <div className="acts">
                  <select
                    value={m.role} disabled={busy}
                    onChange={(e) =>
                      act('/api/admin/team', { lineUserId: m.lineUserId, role: e.target.value })
                    }
                  >
                    {ADMIN_ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_TH[r]}</option>
                    ))}
                  </select>
                  <button
                    className="btn danger" disabled={busy}
                    onClick={() => act('/api/admin/team', { lineUserId: m.lineUserId, disable: true })}
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
                }).then(() => { setNewId(''); setName(''); })
              }
            >
              เพิ่มเข้าทีม
            </button>
            <p className="note left">{ROLE_WHAT[role]}</p>
          </div>
          <p className="note left">
            หารหัสได้จากตาราง users ใน Supabase — ให้เขาทักบอทก่อนหนึ่งครั้ง แล้วรหัสจะไปโผล่ที่นั่น
            <br />
            ทุกการเพิ่ม ถอด และเปลี่ยนระดับ ถูกบันทึกว่าใครทำและทำเมื่อไหร่
          </p>
        </>
      )}
    </Shell>
  );
}
