'use client';

import { useState } from 'react';
import { Shell, Gate, useAdmin } from '../Shell';
import type { StuckPerson } from '../types';

interface Payload { today: string; people: StuckPerson[]; me: { role: string } }

/**
 * รายการเตือนที่ยังไม่ได้ยิง
 *
 * "ยังไม่ได้ยิง" มีสองแบบ คนละสาเหตุคนละวิธีแก้:
 *   ค้าง    — รอบเช้าไม่ได้รัน หรือรันไม่ถึงแถวนี้ (มักแก้ด้วยการยิงซ้ำ)
 *   ส่งไม่ออก — ยิงแล้ว LINE ไม่รับ เช่น ผู้ใช้บล็อกบอท (ยิงซ้ำก็ไม่ออก)
 * รวมสองอย่างนี้เป็นก้อนเดียวเมื่อไหร่ คนกดจะยิงซ้ำใส่คนที่บล็อกไปแล้ววันละหลายรอบ
 *
 * ยิงซ้ำเป็น "คน" ไม่ใช่ "ใบ" — เพราะกฎเดิมของระบบคือหนึ่งคนได้ไม่เกิน
 * สองข้อความต่อวัน ยิงทีละใบจะทำให้คนที่ค้างสามใบได้สามข้อความ และจ่ายสามเท่า
 */
export default function Reminders() {
  const { state, message, data, busy, act } = useAdmin<Payload>('/api/admin/reminders');
  const [asking, setAsking] = useState<StuckPerson | null>(null);
  const [note, setNote] = useState('');

  if (state !== 'ready' || !data) return <Gate state={state} message={message} />;
  const { people } = data;
  const totalItems = people.reduce((n, p) => n + p.items.length, 0);

  async function fire(p: StuckPerson) {
    setAsking(null);
    const out = await act('/api/admin/reminders', { lineUserId: p.lineUserId });
    if (out) setNote((out.note as string) ?? `ยิงซ้ำให้ ${p.name ?? 'ผู้ใช้'} แล้ว`);
  }

  return (
    <Shell role={data.me.role}>
      <h2>รายการค้าง ({totalItems} รายการ · {people.length} คน)</h2>
      {message && <p className="warn">{message}</p>}
      {note && <p className="note left ok">{note}</p>}

      {people.length === 0 ? (
        <p className="muted">ไม่มีรายการค้างครับ — รอบเตือนเดินครบทุกคน</p>
      ) : (
        <div className="rows">
          {people.map((p) => {
            const live = p.items.filter((i) => !i.dead);
            return (
              <div className="lead" key={p.lineUserId}>
                <div className="lead-top">
                  <b>{p.name ?? 'ผู้ใช้'}</b>
                  {p.blocked
                    ? <span className="pill cancelled">บล็อกบอทแล้ว</span>
                    : <span className="pill new">{live.length} ใบรอส่ง</span>}
                </div>

                <div className="stuck">
                  {p.items.map((i) => (
                    <div className={`stuckrow ${i.dead ? 'off' : ''}`} key={i.id}>
                      <span className="what">{i.typeLabel}</span>
                      <span className="when">
                        {i.kind === 'due' ? 'ครบกำหนดแล้ว' : 'ใกล้ครบกำหนด'}
                        {i.lateDays > 0 && ` · ค้างมา ${i.lateDays} วัน`}
                      </span>
                      <span className={`tagx ${i.status}`}>
                        {i.status === 'failed' ? 'ส่งไม่ออก' : 'ค้าง'}
                      </span>
                      {i.expired && <span className="tagx warn">เลยวันหมดอายุแล้ว</span>}
                      {i.dead && <span className="tagx off">ไม่ต้องส่งแล้ว</span>}
                      {i.error && <span className="why">{i.error}</span>}
                    </div>
                  ))}
                </div>

                <div className="acts">
                  {/*
                    ไม่มีอะไรจะส่งแล้ว = ปุ่มนี้ไม่ได้ยิง มันแค่ปิดรายการ
                    ปุ่มเขียวที่เขียนว่า "ยิงซ้ำ (0 ข้อความ)" คือปุ่มที่โกหกว่าตัวเองทำอะไร
                  */}
                  {p.messages === 0 ? (
                    <button
                      className="btn" disabled={busy}
                      onClick={() => fire(p)}
                    >
                      ปิดรายการ (ไม่ส่งอะไรออกไป)
                    </button>
                  ) : (
                    <button
                      className="btn primary" disabled={busy}
                      onClick={() => setAsking(p)}
                    >
                      ยิงซ้ำ ({p.messages} ข้อความ · {(p.messages * 0.06).toFixed(2)} บาท)
                    </button>
                  )}
                </div>
                <code>{p.lineUserId}</code>
              </div>
            );
          })}
        </div>
      )}

      <p className="note left">
        ยิงซ้ำจะรวมทุกใบของคนนั้นเป็นข้อความเดียว ตามกฎเดิมที่ว่าหนึ่งคนได้ไม่เกินสองข้อความต่อวัน
        <br />
        รายการที่ระบบตัดสินว่าไม่ต้องส่งแล้ว (เอกสารถูกเก็บ ยังไม่ยืนยัน หรือผู้ใช้บล็อกบอท)
        จะถูกปิดให้อัตโนมัติโดยไม่เสียค่าข้อความ
      </p>

      {/* ถามก่อนเสมอ เพราะกดพลาดหนึ่งครั้งคือข้อความที่เรียกคืนไม่ได้ */}
      {asking && (
        <div className="sheet" role="dialog" aria-modal="true">
          <div className="sheet-card">
            <h3>ยิงซ้ำให้ {asking.name ?? 'ผู้ใช้'}?</h3>
            <p>
              จะส่ง {asking.messages} ข้อความ ค่าใช้จ่ายประมาณ {(asking.messages * 0.06).toFixed(2)} บาท
            </p>
            {asking.items.some((i) => i.expired && !i.dead) && (
              <p className="warn">
                มีเอกสารที่เลยวันหมดอายุไปแล้วอยู่ในชุดนี้ — ลูกค้าจะได้ข้อความเตือนเรื่องที่สายไปแล้ว
              </p>
            )}
            {asking.blocked && (
              <p className="warn">คนนี้บล็อกบอทไว้ ยิงไปก็ไม่ถึง แต่จะเสียค่าเรียก API</p>
            )}
            <div className="acts">
              <button className="btn" disabled={busy} onClick={() => setAsking(null)}>ยังก่อน</button>
              <button className="btn primary" disabled={busy} onClick={() => fire(asking)}>ยิงเลย</button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
