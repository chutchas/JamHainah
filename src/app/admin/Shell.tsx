'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * โครงหน้าห้องทำงาน — ใช้ร่วมกันทั้งสามหน้า
 *
 * หัวเว็บชุดเดียวกับ "เอกสารของฉัน" แต่ติดป้าย admin เพราะเราไม่อยาก
 * เผลอโชว์หน้านี้ตอนสาธิตให้คนอื่นดู
 *
 * เมนูอยู่ตรงนี้ที่เดียว เพิ่มหน้าใหม่แล้วทุกหน้าเห็นพร้อมกัน
 * — เมนูที่ก๊อปไว้ทุกหน้า คือเมนูที่วันหนึ่งจะมีหน้าหนึ่งตกหล่น
 */
const NAV = [
  { href: '/admin', label: 'สรุป' },
  { href: '/admin/cases', label: 'เคส' },
  { href: '/admin/reminders', label: 'รายการค้าง' },
  { href: '/admin/team', label: 'ทีม' },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const here = usePathname();
  return (
    <div className="wrap legal admin">
      <header className="hero">
        <div className="hero-img" role="presentation" />
        <div className="hero-bar">
          <img className="logo" src="/brand/logo.png" alt="" width={44} height={44} />
          <h1>ห้องทำงาน</h1>
          <span className="tag">admin</span>
        </div>
      </header>

      <nav className="adminnav">
        {NAV.map((n) => (
          <a
            key={n.href}
            href={n.href}
            /* หน้าย่อยอย่าง /admin/cases/<id> ต้องยังไฮไลต์ที่ "เคส" อยู่ */
            className={here === n.href || (n.href !== '/admin' && here.startsWith(`${n.href}/`)) ? 'on' : undefined}
          >
            {n.label}
          </a>
        ))}
        <a className="out" href="/api/admin/logout">ออกจากระบบ</a>
      </nav>

      {children}
    </div>
  );
}

type State = 'loading' | 'ready' | 'error' | 'signedout';

/**
 * ข้อความของปัญหาที่เกิดระหว่างเดินทางไป-กลับหน้า LINE
 * เขียนให้บอกว่า "ต้องไปแก้ตรงไหน" ไม่ใช่แค่บอกว่าพัง
 */
const REASON: Record<string, string> = {
  bye: 'ออกจากระบบแล้ว',
  cancelled: 'ยกเลิกการเข้าสู่ระบบ',
  state: 'ลิงก์เข้าสู่ระบบหมดอายุ ลองกดเข้าใหม่อีกครั้ง',
  exchange: 'ต่อกับ LINE ไม่สำเร็จ — ตรวจ LINE_LOGIN_CHANNEL_SECRET และ Callback URL ในคอนโซล LINE',
  verify: 'LINE ไม่รับรองการเข้าสู่ระบบนี้',
};

/**
 * โหลดข้อมูลห้องทำงานหนึ่งชุด พร้อมจัดการเรื่องตัวตนให้ครบในที่เดียว
 *
 * 401 = ไม่รู้ว่าเป็นใคร → พาไปล็อกอิน
 * 403 = รู้แล้วแต่ไม่ใช่ผู้ดูแล → บอกตรง ๆ ไม่ต้องพาไปล็อกอินซ้ำให้เสียเวลา
 * สองอย่างนี้เคยรวมเป็นข้อความเดียว แล้วทำให้คนไปไล่หาสิทธิ์ที่ไม่ได้เสีย
 */
export function useAdmin<T>(url: string) {
  const [state, setState] = useState<State>('loading');
  const [message, setMessage] = useState('');
  const [data, setData] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (first = false) => {
    const params = new URLSearchParams(window.location.search);
    const reason = params.get('e');
    if (first && reason && REASON[reason]) {
      setMessage(REASON[reason]);
      setState('signedout');
      return;
    }
    try {
      const res = await fetch(url);
      if (res.status === 401) {
        // เพิ่งกลับจากหน้าล็อกอินสด ๆ แล้วยังไม่ผ่าน = เบราว์เซอร์ไม่เก็บคุกกี้
        // ไม่ใช่ยังไม่ได้ล็อกอิน — ถ้าเด้งไปอีกจะวนไม่จบ
        if (params.get('ok') === '1') {
          setMessage('เข้าสู่ระบบแล้วแต่เบราว์เซอร์ไม่เก็บคุกกี้ — ลองปิดโหมดไม่ระบุตัวตน หรือเปิดในเบราว์เซอร์ปกติ');
          setState('signedout');
          return;
        }
        window.location.href = '/api/admin/login';
        return;
      }
      if (res.status === 403) throw new Error('บัญชีนี้ไม่ใช่ผู้ดูแลระบบ');
      if (!res.ok) throw new Error(`โหลดข้อมูลไม่สำเร็จ (${res.status})`);
      setData(await res.json());
      setState('ready');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }, [url]);

  useEffect(() => { load(true); }, [load]);

  /**
   * ทุกการเขียนโหลดข้อมูลใหม่ทั้งก้อน ไม่แก้ state เอาเอง
   *
   * หน้านี้มีคนใช้พร้อมกันได้ตั้งแต่วันแรกที่มีทีม การเดาสถานะฝั่งหน้าจอ
   * จะทำให้สองคนเห็นคิวไม่ตรงกัน แล้วรับงานชิ้นเดียวกันซ้อน
   */
  /** ยิงคำสั่งหนึ่งครั้ง คืนคำตอบดิบ — ใช้ตอนที่ยังไม่ควรโหลดหน้าใหม่ เช่นการค้นหา */
  const post = useCallback(async (
    target: string, body: unknown,
  ): Promise<Record<string, any> | null> => {
    setBusy(true);
    try {
      const res = await fetch(target, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const out = await res.json().catch(() => ({}));
      if (res.status === 401) { window.location.href = '/api/admin/login'; return null; }
      if (!res.ok) { setMessage(out.error ?? `ทำรายการไม่สำเร็จ (${res.status})`); return null; }
      setMessage('');
      return out;
    } finally {
      setBusy(false);
    }
  }, []);

  const act = useCallback(async (
    target: string, body: unknown,
  ): Promise<Record<string, any> | null> => {
    const out = await post(target, body);
    if (out) await load();
    return out;
  }, [post, load]);

  return { state, message, setMessage, data, busy, act, post, reload: load };
}

/** หน้าจอระหว่างยังไม่มีข้อมูลให้แสดง — เขียนที่เดียวให้ทุกหน้าเหมือนกัน */
export function Gate({ state, message }: { state: State; message: string }) {
  if (state === 'loading') return <Shell><p>กำลังโหลด…</p></Shell>;
  if (state === 'signedout') {
    return (
      <Shell>
        <p>{message}</p>
        <p className="acts"><a className="pill" href="/api/admin/login">เข้าสู่ระบบด้วย LINE</a></p>
      </Shell>
    );
  }
  return (
    <Shell>
      <p className="warn">{message}</p>
      <p className="acts"><a className="pill" href="/api/admin/logout">ออกจากระบบ</a></p>
    </Shell>
  );
}
