'use client';

import { useState } from 'react';
import { Shell, Gate, useAdmin } from '../Shell';
import type { Summary } from '../types';

/**
 * ทีม — หน้าเดียวในหลังบ้านที่แตะสิทธิ์ของคนอื่น
 *
 * แยกออกมาจากหน้าสรุปโดยตั้งใจ: งานนี้ทำนาน ๆ ครั้ง แต่ผิดแล้วเจ็บ
 * การให้มันนั่งอยู่ท้ายหน้าที่เปิดดูทุกวัน คือการเชิญให้เผลอกด
 */
export default function Team() {
  const { state, message, data, busy, act } = useAdmin<Summary>('/api/admin/summary');
  const [newId, setNewId] = useState('');
  const [name, setName] = useState('');

  if (state !== 'ready' || !data) return <Gate state={state} message={message} />;
  const { team, me } = data;
  const owner = me.role === 'owner';

  return (
    <Shell>
      <h2>ทีม ({team.filter((m) => !m.disabled).length} คนที่ใช้งานได้)</h2>
      {message && <p className="warn">{message}</p>}

      {!owner && (
        <p className="note left">
          คุณเป็น staff — ดูรายชื่อได้ แต่เพิ่มหรือถอดสิทธิ์ได้เฉพาะเจ้าของระบบ
        </p>
      )}

      <div className="rows">
        {team.length === 0 && (
          <p className="muted">
            ยังไม่มีใครในตาราง — ตอนนี้เข้าได้ด้วย ADMIN_LINE_USER_ID เท่านั้น
          </p>
        )}
        {team.map((m) => (
          <div className="lead" key={m.lineUserId}>
            <div className="lead-top">
              <b>{m.name ?? 'ไม่มีชื่อ'}</b>
              <span className={`pill ${m.disabled ? 'cancelled' : m.role === 'owner' ? 'accepted' : ''}`}>
                {m.disabled ? 'ถูกถอดสิทธิ์' : m.role === 'owner' ? 'เจ้าของระบบ' : 'staff'}
              </span>
            </div>
            <code>{m.lineUserId}</code>
            {owner && !m.disabled && m.lineUserId !== me.userId && (
              <div className="acts">
                <button
                  className="btn danger" disabled={busy}
                  onClick={() => act('/api/admin/team', { lineUserId: m.lineUserId, disable: true })}
                >
                  ถอดสิทธิ์
                </button>
              </div>
            )}
            {m.lineUserId === me.userId && <div className="muted">นี่คือบัญชีของคุณเอง</div>}
          </div>
        ))}
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
              placeholder="ชื่อที่จะให้แสดงในหน้านี้ (ใส่หรือไม่ใส่ก็ได้)"
            />
            <button
              className="btn primary" disabled={busy || !/^U[0-9a-f]{32}$/.test(newId.trim())}
              onClick={() =>
                act('/api/admin/team', {
                  lineUserId: newId.trim(), role: 'staff', displayName: name.trim() || undefined,
                }).then(() => { setNewId(''); setName(''); })
              }
            >
              เพิ่มเป็น staff
            </button>
          </div>
          <p className="note left">
            หารหัสได้จากตาราง users ใน Supabase — ให้เขาทักบอทก่อนหนึ่งครั้ง แล้วรหัสจะไปโผล่ที่นั่น
            <br />
            staff ทำงานในคิวและยิงซ้ำได้ แต่แตะสิทธิ์ของคนอื่นไม่ได้ และถอดสิทธิ์ตัวเองไม่ได้
            <br />
            ทุกการเพิ่มและถอด ถูกบันทึกว่าใครทำและทำเมื่อไหร่
          </p>
        </>
      )}
    </Shell>
  );
}
