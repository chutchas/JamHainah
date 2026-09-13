'use client';

import { useEffect, useState } from 'react';

/**
 * หลังบ้าน — อ่านอย่างเดียว
 *
 * เปิดผ่าน LINE เหมือนหน้าเอกสารของฉัน เพราะเราไม่มีระบบสมาชิกและไม่ควรมี
 * ตัวตนมาจาก idToken ของ LINE แล้วเซิร์ฟเวอร์เช็คว่า user id อยู่ใน allowlist
 *
 * สิ่งที่หน้านี้ต้องตอบให้ได้ในสามวินาทีแรก เรียงตามความเร่ง:
 *   1. มีงานเข้าไหม (คนกด "ให้เราต่อให้")
 *   2. เมื่อเช้าเตือนออกไหม มีที่ส่งไม่ออกค้างอยู่ไหม
 *   3. โมเดลอ่านแม่นแค่ไหน
 * ตัวเลขโตช้าอย่างจำนวนผู้ใช้อยู่ล่างสุด เพราะดูวันละครั้งก็พอ
 */

declare global {
  interface Window { liff?: any }
}

interface Lead {
  at: string;
  atThai: string;
  name: string | null;
  lineUserId: string | null;
  typeLabel: string;
  via: string;
  started: boolean;
}

interface Summary {
  today: string;
  overview: {
    users: number; unfollowed: number; docs: number; confirmed: number;
    docsPerUser: number; confirmedPct: number;
  };
  reminders: {
    pendingToday: number; failedQueue: number; sentWeek: number;
    lastCron: null | { at: string; messages?: number; users?: number; failed?: number; estimated_cost_thb?: number };
  };
  reading: {
    readOk: number; corrected: number; accuracy: number | null;
    missed: number; notDocument: number; ocrError: number; limitHit: number; aiCalls: number;
  };
  leads: Lead[];
}

/**
 * หัวหน้าเว็บชุดเดียวกับ "เอกสารของฉัน" แต่ติดป้ายว่าหลังบ้าน
 *
 * หน้านี้เปิดในแอป LINE ซึ่งไม่มีแถบที่อยู่เว็บให้ดู ถ้าหน้าตาเปล่า ๆ
 * จะแยกไม่ออกว่านี่คือหน้าของเรา หรือหลุดไปเว็บไหนแล้ว
 * และป้าย "หลังบ้าน" ต้องชัด เพราะเราไม่อยากเผลอโชว์หน้านี้ตอนสาธิตให้คนอื่นดู
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="wrap legal admin">
      <header className="hero">
        <div className="hero-img" role="presentation" />
        <div className="hero-bar">
          <img className="logo" src="/brand/logo.png" alt="" width={44} height={44} />
          <h1>หลังบ้าน</h1>
          <span className="tag">admin</span>
        </div>
      </header>
      {children}
    </div>
  );
}

export default function Admin() {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [data, setData] = useState<Summary | null>(null);

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
        const res = await fetch('/api/admin/summary', { headers: { 'x-liff-id-token': idToken } });
        if (res.status === 403) throw new Error('บัญชีนี้ไม่ใช่ผู้ดูแลระบบ');
        if (!res.ok) throw new Error(`โหลดข้อมูลไม่สำเร็จ (${res.status})`);

        if (cancelled) return;
        setData(await res.json());
        setState('ready');
      } catch (err) {
        if (cancelled) return;
        setMessage(err instanceof Error ? err.message : String(err));
        setState('error');
      }
    }

    boot();
    return () => { cancelled = true; };
  }, []);

  if (state === 'loading') return <Shell><p>กำลังโหลด…</p></Shell>;
  if (state === 'error' || !data) return <Shell><p className="warn">{message}</p></Shell>;

  const { overview, reminders, reading, leads } = data;
  const cron = reminders.lastCron;
  const cronAt = cron ? new Date(cron.at) : null;
  const cronStale = cronAt ? Date.now() - cronAt.getTime() > 26 * 3600_000 : true;

  return (
    <Shell>
      <p className="note left">ข้อมูล ณ {new Date().toLocaleString('th-TH')}</p>

      <h2>งานเข้า ({leads.length} ครั้งใน 30 วัน)</h2>
      {leads.length === 0 ? (
        <p>ยังไม่มีใครกด &ldquo;ให้เราต่อให้&rdquo;</p>
      ) : (
        <div className="rows">
          {leads.map((l, i) => (
            <div className="lead" key={`${l.at}-${i}`}>
              <div className="lead-top">
                <b>{l.name ?? 'ผู้ใช้'}</b>
                <span className="muted">{l.atThai}</span>
              </div>
              <div className="muted">
                {l.typeLabel} · {l.via === 'liff' || l.via === 'web' ? 'จากหน้าเว็บ' : 'จากแชท'}
                {l.started ? ' · ให้ข้อมูลแล้ว' : ''}
              </div>
              <code>{l.lineUserId}</code>
            </div>
          ))}
        </div>
      )}

      <h2>การเตือน</h2>
      <div className="tiles">
        <div className={`tile ${cronStale ? 'bad' : ''}`}>
          <span className="n">{cronAt ? cronAt.toLocaleDateString('th-TH') : '—'}</span>
          <span className="l">cron รอบล่าสุด</span>
        </div>
        <div className={`tile ${reminders.failedQueue > 0 ? 'bad' : ''}`}>
          <span className="n">{reminders.failedQueue}</span>
          <span className="l">ส่งไม่ออก (ค้าง)</span>
        </div>
        <div className="tile">
          <span className="n">{reminders.pendingToday}</span>
          <span className="l">คิวถึงกำหนดวันนี้</span>
        </div>
        <div className="tile">
          <span className="n">{reminders.sentWeek}</span>
          <span className="l">ส่งแล้วใน 7 วัน</span>
        </div>
      </div>
      {cron && (
        <p className="note left">
          รอบล่าสุด: ส่ง {cron.messages ?? 0} ข้อความ · {cron.users ?? 0} คน ·
          ล้มเหลว {cron.failed ?? 0} · ค่าข้อความ {cron.estimated_cost_thb ?? 0} บาท
        </p>
      )}
      {cronStale && <p className="warn">cron ไม่ได้รันมาเกิน 26 ชั่วโมง — ต้องดู log ที่ Vercel</p>}

      <h2>การอ่านเอกสาร (30 วัน)</h2>
      <div className="tiles">
        <div className="tile">
          <span className="n">{reading.accuracy === null ? '—' : `${reading.accuracy}%`}</span>
          <span className="l">อ่านถูกโดยไม่ถูกแก้</span>
        </div>
        <div className="tile">
          <span className="n">{reading.readOk}</span>
          <span className="l">อ่านออก</span>
        </div>
        <div className="tile">
          <span className="n">{reading.corrected}</span>
          <span className="l">ผู้ใช้แก้วันที่</span>
        </div>
        <div className="tile">
          <span className="n">{reading.missed + reading.ocrError}</span>
          <span className="l">อ่านไม่ออก</span>
        </div>
        <div className="tile">
          <span className="n">{reading.aiCalls}</span>
          <span className="l">เรียก AI</span>
        </div>
        <div className={`tile ${reading.limitHit > 0 ? 'bad' : ''}`}>
          <span className="n">{reading.limitHit}</span>
          <span className="l">ชนเพดานรายวัน</span>
        </div>
      </div>

      <h2>ผู้ใช้</h2>
      <div className="tiles">
        <div className="tile"><span className="n">{overview.users}</span><span className="l">ผู้ใช้</span></div>
        <div className="tile"><span className="n">{overview.docs}</span><span className="l">เอกสาร</span></div>
        <div className="tile"><span className="n">{overview.docsPerUser}</span><span className="l">เอกสาร/คน</span></div>
        <div className="tile"><span className="n">{overview.confirmedPct}%</span><span className="l">ยืนยันแล้ว</span></div>
        <div className="tile"><span className="n">{overview.unfollowed}</span><span className="l">บล็อก/ลบเพื่อน</span></div>
      </div>

      <p className="note left">
        หน้านี้อ่านอย่างเดียว การแก้ข้อมูลทำที่ Supabase — ของที่แก้ได้จากมือถือ คือของที่แก้ผิดได้จากมือถือ
      </p>
    </Shell>
  );
}
