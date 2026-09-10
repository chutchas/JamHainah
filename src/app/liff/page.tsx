'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * "รายการของฉัน" — เว็บเพจที่เปิดในแอป LINE
 *
 * การลบมีสองทาง เพราะคนละสถานการณ์:
 *   ปัดซ้าย     ลบทีละใบ — ท่าที่คนใช้ LINE ทำเป็นอยู่แล้ว ไม่ต้องสอน
 *   โหมดเลือก   ลบหลายใบ — สำหรับตอนเก็บกวาดของเก่า
 */

interface Doc {
  id: string;
  emoji: string;
  typeLabel: string;
  label: string | null;
  expiryThai: string;
  days: number;
  status: 'ok' | 'watch' | 'soon' | 'overdue';
  confirmed: boolean;
}

declare global {
  interface Window { liff?: any }
}

const REVEAL = 88; // ความกว้างปุ่มลบที่โผล่มาตอนปัด

export default function LiffPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [message, setMessage] = useState('');
  const [token, setToken] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const drag = useRef<{ id: string; startX: number; dx: number } | null>(null);
  const [dragDx, setDragDx] = useState(0);

  const load = useCallback(async (idToken: string) => {
    const res = await fetch('/api/liff/documents', { headers: { 'x-liff-id-token': idToken } });
    if (!res.ok) throw new Error(`โหลดรายการไม่สำเร็จ (${res.status})`);
    const data = await res.json();
    setDocs(data.documents ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) throw new Error('ยังไม่ได้ตั้งค่า LIFF ID');

        await new Promise<void>((resolve, reject) => {
          if (window.liff) return resolve();
          const el = document.createElement('script');
          el.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
          el.onload = () => resolve();
          el.onerror = () => reject(new Error('โหลด LINE SDK ไม่สำเร็จ'));
          document.head.appendChild(el);
        });

        await window.liff.init({ liffId });
        if (!window.liff.isLoggedIn()) { window.liff.login(); return; }

        const idToken = window.liff.getIDToken();
        if (!idToken) throw new Error('ไม่ได้รับ token จาก LINE');
        if (cancelled) return;

        setToken(idToken);
        await load(idToken);
        if (!cancelled) setState('ready');
      } catch (err) {
        if (!cancelled) { setMessage(err instanceof Error ? err.message : String(err)); setState('error'); }
      }
    }
    boot();
    return () => { cancelled = true; };
  }, [load]);

  async function deleteIds(ids: string[]) {
    if (!token || ids.length === 0) return;
    setBusy(true);
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/liff/documents?id=${encodeURIComponent(id)}`, {
            method: 'DELETE', headers: { 'x-liff-id-token': token },
          })
        )
      );
      setDocs((d) => d.filter((x) => !ids.includes(x.id)));
      setSelected(new Set());
      setOpenId(null);
    } finally {
      setBusy(false);
    }
  }

  async function deleteEverything() {
    if (!token) return;
    if (!confirm('ลบเอกสารทั้งหมดถาวร ยืนยันไหม')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/liff/documents?id=all', {
        method: 'DELETE', headers: { 'x-liff-id-token': token },
      });
      if (res.ok) { setDocs([]); setMessage('ลบข้อมูลทั้งหมดเรียบร้อยแล้ว'); }
    } finally { setBusy(false); }
  }

  /* ---- ปัดซ้าย ---- */
  function onDown(e: React.PointerEvent, id: string) {
    if (selectMode) return;
    drag.current = { id, startX: e.clientX, dx: 0 };
  }
  function onMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const dx = Math.max(-REVEAL, Math.min(0, e.clientX - drag.current.startX));
    drag.current.dx = dx;
    setDragDx(dx);
  }
  function onUp() {
    const d = drag.current;
    drag.current = null;
    setDragDx(0);
    if (!d) return;
    if (d.dx < -REVEAL / 2) setOpenId(d.id);
    else if (openId === d.id) setOpenId(null);
  }

  function offsetFor(id: string) {
    if (drag.current?.id === id) return dragDx;
    return openId === id ? -REVEAL : 0;
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (state === 'loading') return <div className="wrap"><p className="muted">กำลังโหลด…</p></div>;
  if (state === 'error') return <div className="wrap"><p className="muted">{message}</p></div>;

  const allSelected = docs.length > 0 && selected.size === docs.length;

  return (
    <div className="wrap" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <div className="head">
        <h1>📋 รายการของฉัน</h1>
        {docs.length > 0 && (
          <button
            className="link"
            onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); setOpenId(null); }}
          >
            {selectMode ? 'ยกเลิก' : '☑︎ เลือก'}
          </button>
        )}
      </div>

      {selectMode && docs.length > 0 && (
        <button
          className="link selall"
          onClick={() => setSelected(allSelected ? new Set() : new Set(docs.map((d) => d.id)))}
        >
          {allSelected ? 'ไม่เลือกเลย' : `เลือกทั้งหมด ${docs.length} รายการ`}
        </button>
      )}

      <div className="card">
        {docs.length === 0 ? (
          <div className="empty">ยังไม่มีเอกสารครับ<br />ส่งรูปเอกสารเข้าแชทได้เลย</div>
        ) : (
          docs.map((d) => (
            <div className="swipe" key={d.id}>
              <button className="swipe-del" onClick={() => deleteIds([d.id])} disabled={busy}>ลบ</button>
              <div
                className={`doc${selectMode ? ' picking' : ''}`}
                style={{ transform: `translateX(${offsetFor(d.id)}px)` }}
                onPointerDown={(e) => onDown(e, d.id)}
                onClick={() => selectMode && toggle(d.id)}
              >
                {selectMode && (
                  <span className={`box${selected.has(d.id) ? ' on' : ''}`} aria-hidden="true" />
                )}
                <span className="nm">{d.emoji} {d.typeLabel}{d.label ? ` · ${d.label}` : ''}</span>
                <span className="sb">หมดอายุ {d.expiryThai}</span>
                <span className={`days ${d.status}`}>
                  {d.days < 0 ? `เลย ${Math.abs(d.days)} วัน` : d.days === 0 ? 'วันนี้' : `เหลือ ${d.days} วัน`}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {!selectMode && docs.length > 0 && <p className="note">← ปัดซ้ายที่รายการเพื่อลบ</p>}

      <div className="foot">
        <button className="btn danger" onClick={deleteEverything} disabled={busy}>
          ลบข้อมูลของฉันทั้งหมด
        </button>
        <p className="note">เราไม่เก็บรูปเอกสารของคุณ — อ่านวันหมดอายุแล้วทิ้งทันที</p>
      </div>

      {selectMode && selected.size > 0 && (
        <div className="bar">
          <button className="btn primary" onClick={() => deleteIds([...selected])} disabled={busy}>
            {busy ? 'กำลังลบ…' : `ลบ ${selected.size} รายการ`}
          </button>
        </div>
      )}
    </div>
  );
}
