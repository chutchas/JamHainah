'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ROLE_TH, type AdminRole } from '@/lib/domain/roles';

/**
 * โครงหน้าห้องทำงาน — ใช้ร่วมกันทั้งสามหน้า
 *
 * หัวเว็บชุดเดียวกับ "เอกสารของฉัน" แต่ติดป้าย admin เพราะเราไม่อยาก
 * เผลอโชว์หน้านี้ตอนสาธิตให้คนอื่นดู
 *
 * เมนูอยู่ตรงนี้ที่เดียว เพิ่มหน้าใหม่แล้วทุกหน้าเห็นพร้อมกัน
 * — เมนูที่ก๊อปไว้ทุกหน้า คือเมนูที่วันหนึ่งจะมีหน้าหนึ่งตกหล่น
 *
 * มาร์กอัปชุดเดียวทั้งสองจอ ต่างกันแค่ CSS:
 * จอคอมเป็นแถบบน · มือถือย้ายลงล่างให้นิ้วโป้งถึง
 * ถ้าแยกเป็นสองก้อน วันหนึ่งจะมีเมนูหนึ่งที่ลืมเพิ่มหน้าใหม่เข้าไป
 */
const NAV = [
  { href: '/admin', label: 'สรุป' },
  { href: '/admin/cases', label: 'เคส' },
  { href: '/admin/reminders', label: 'รายการค้าง' },
  { href: '/admin/links', label: 'ลิงก์' },
  { href: '/admin/team', label: 'ทีม' },
];

/**
 * ป้ายมุมขวาบอก "ระดับของคนที่กำลังดูอยู่" ไม่ใช่ "นี่คือหน้า admin"
 *
 * อย่างหลังเข้ามาถึงหน้านี้ได้ก็รู้อยู่แล้ว ส่วนอย่างแรกตอบคำถามที่เกิดจริง:
 * พนักงานที่ไม่เห็นราคาหรือกดยิงซ้ำไม่ได้ จะรู้ว่าเพราะระดับของตัวเอง
 * ไม่ใช่เพราะระบบพัง แล้วไม่ต้องไปถามใคร
 *
 * ยังไม่รู้ระดับ (หน้ากำลังโหลด หรือยังไม่ผ่านด่าน) = ไม่ต้องขึ้นป้าย
 * ป้ายที่เดาไว้ก่อนแล้วเปลี่ยนทีหลัง แย่กว่าป้ายที่ยังไม่มา
 */
export function Shell({ children, role, onRefresh, busy, flash }: {
  children: React.ReactNode;
  role?: string;
  onRefresh?: () => void;
  busy?: boolean;
  flash?: string;
}) {
  const here = usePathname();
  const roleLabel = role ? ROLE_TH[role as AdminRole] : null;
  return (
    <div className="wrap legal admin">
      {/*
        ไม่มีรูปปกในห้องทำงาน — ปกมีไว้บอกว่าที่นี่คือ "จำให้นะ" ให้ลูกค้าที่เพิ่งมาถึง
        แต่คนที่เปิดหน้านี้รู้อยู่แล้วว่ามาทำอะไร ปกจึงเป็นแค่ 150px ที่กินที่ทำงานไปเปล่า ๆ
      */}
      <header className="hero">
        <div className="hero-bar">
          <img className="logo" src="/brand/logo.png" alt="" width={44} height={44} />
          <h1>ห้องทำงาน</h1>
          {roleLabel && <span className="tag">{roleLabel}</span>}
          {/*
            รีเฟรชด้วยมือ ไม่ใช่ดึงข้อมูลใหม่เองทุก 30 วิ
            หน้าที่ขยับเองตอนคนกำลังอ่าน คือหน้าที่ทำให้กดผิดแถว
          */}
          {onRefresh && (
            <button
              className="signout" type="button" onClick={onRefresh} disabled={busy}
              title="โหลดข้อมูลใหม่" aria-label="โหลดข้อมูลใหม่"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
          )}
          {/*
            ออกจากระบบเป็นไอคอน อยู่ไกลจากแท็บที่กดทุกวัน
            กดพลาดแล้วแค่ล็อกอินใหม่ ไม่มีอะไรหาย จึงยอมแลกกับพื้นที่ที่ได้คืน
          */}
          <a className="signout" href="/api/admin/logout" title="ออกจากระบบ" aria-label="ออกจากระบบ">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </a>
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
      </nav>

      {/* บอกว่าบันทึกแล้ว — ปุ่มที่กดแล้วเงียบ ทำให้คนกดซ้ำเพราะไม่แน่ใจ */}
      {flash && <p className="flash">{flash}</p>}

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
  const [flash, setFlash] = useState('');

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
    target: string, body: unknown, say = 'บันทึกแล้ว',
  ): Promise<Record<string, any> | null> => {
    const out = await post(target, body);
    if (out) {
      await load();
      setFlash((out.note as string) || say);
      // หายเองใน 3 วิ — ข้อความที่ค้างอยู่ จะถูกอ่านว่าเป็นผลของการกดครั้งถัดไป
      window.setTimeout(() => setFlash(''), 3000);
    }
    return out;
  }, [post, load]);

  return { state, message, setMessage, data, busy, flash, act, post, reload: load };
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

/**
 * รหัส LINE ของลูกค้า — ยาว 33 ตัวและไม่มีใครอ่านออก
 *
 * แต่ลบทิ้งไม่ได้ เพราะเป็นตัวเดียวที่เอาไปค้นใน Supabase ได้ตอนมีเรื่อง
 * จึงย่อให้พ้นทาง แล้วกดทีเดียวได้ทั้งก้อนตอนที่ต้องใช้จริง
 */
export function UserId({ id }: { id: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!id) return null;
  const short = `${id.slice(0, 5)}…${id.slice(-4)}`;
  return (
    <button
      type="button" className="uid" title={`คัดลอก ${id}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard?.writeText(id).then(
          () => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); },
          () => {},
        );
      }}
    >
      {copied ? 'คัดลอกแล้ว' : short}
    </button>
  );
}
