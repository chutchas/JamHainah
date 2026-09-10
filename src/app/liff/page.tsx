'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * "รายการของฉัน" — เว็บเพจที่เปิดในแอป LINE
 *
 * ทำไมเป็น LIFF ไม่ใช่ carousel ในแชท:
 *   carousel เสียโควตาข้อความทุกครั้งที่เปิดดู และรกทันทีที่เอกสารเกิน 5 ใบ
 *   LIFF ล็อกอินอัตโนมัติด้วย LINE ID ไม่ต้องมีระบบสมาชิก และไม่เสียค่าข้อความเลย
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

export default function LiffPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [message, setMessage] = useState('');
  const [token, setToken] = useState<string | null>(null);

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
          const s = document.createElement('script');
          s.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
          s.onload = () => resolve();
          s.onerror = () => reject(new Error('โหลด LINE SDK ไม่สำเร็จ'));
          document.head.appendChild(s);
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

  async function removeDoc(id: string) {
    if (!token) return;
    const res = await fetch(`/api/liff/documents?id=${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: { 'x-liff-id-token': token },
    });
    if (res.ok) setDocs((d) => d.filter((x) => x.id !== id));
  }

  async function deleteEverything() {
    if (!token) return;
    if (!confirm('ลบเอกสารและรูปทั้งหมดถาวร ยืนยันไหม')) return;
    const res = await fetch('/api/liff/documents?id=all', {
      method: 'DELETE', headers: { 'x-liff-id-token': token },
    });
    if (res.ok) { setDocs([]); setMessage('ลบข้อมูลทั้งหมดเรียบร้อยแล้ว'); }
  }

  if (state === 'loading') return <div className="wrap"><p className="muted">กำลังโหลด…</p></div>;
  if (state === 'error') return <div className="wrap"><p className="muted">{message}</p></div>;

  return (
    <div className="wrap">
      <div className="head">
        <h1>📋 รายการของฉัน</h1>
        <span className="count">{docs.length} รายการ</span>
      </div>

      <div className="card">
        {docs.length === 0 ? (
          <div className="empty">
            ยังไม่มีเอกสารครับ<br />
            ส่งรูปเอกสารเข้าแชทได้เลย
          </div>
        ) : (
          docs.map((d) => (
            <div className="doc" key={d.id} onDoubleClick={() => removeDoc(d.id)}>
              <span className="nm">{d.emoji} {d.typeLabel}{d.label ? ` · ${d.label}` : ''}</span>
              <span className="sb">หมดอายุ {d.expiryThai}</span>
              <span className={`days ${d.status}`}>
                {d.days < 0 ? `เลย ${Math.abs(d.days)} วัน` : d.days === 0 ? 'วันนี้' : `เหลือ ${d.days} วัน`}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="foot">
        <button className="btn danger" onClick={deleteEverything}>ลบข้อมูลของฉันทั้งหมด</button>
        <p className="note">เราไม่เก็บรูปเอกสารของคุณ — ลบอัตโนมัติภายใน 30 วัน</p>
      </div>
    </div>
  );
}
