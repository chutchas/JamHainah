'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * "เอกสารของฉัน" — เว็บเพจที่เปิดในแอป LINE
 *
 * หน้านี้เคยบอกได้แค่ "เหลือกี่วัน" ซึ่งยังไม่ช่วยอะไร
 * คนที่เปิดมาเห็นว่าเหลือ 12 วัน ต้องการรู้ต่อว่า "แล้วต้องไปทำที่ไหน"
 *
 * ปัดสองทาง เพราะเป็นคนละเจตนากัน:
 *   ปัดซ้าย   ลบ        — ท่าที่คนใช้ LINE ทำเป็นอยู่แล้ว ไม่ต้องสอน
 *   ปัดขวา    ต่ออายุ   — แผนที่ / ลิงก์ราชการ / ให้เราต่อให้
 *   โหมดเลือก ลบหลายใบ  — สำหรับตอนเก็บกวาดของเก่า
 */

type ActionKind = 'upsell' | 'link' | 'map';

interface DocAction {
  kind: ActionKind;
  label: string;
  url?: string;
  /** เฉพาะ map — เก็บไว้สร้างลิงก์ใหม่เมื่อได้พิกัดมาระหว่างเปิดหน้าอยู่ */
  term?: string;
}

interface Doc {
  id: string;
  /** ISO — ใช้เป็นค่าตั้งต้นของช่องแก้วันที่ */
  expiry: string;
  /** ไอคอนประเภทเอกสารของเราเอง ชุดเดียวกับในแชทและ rich menu */
  icon: string;
  typeLabel: string;
  label: string | null;
  expiryThai: string;
  days: number;
  status: 'ok' | 'watch' | 'soon' | 'overdue';
  confirmed: boolean;
  /** รอบที่ยังจะเตือน — ว่างได้ ถ้าหมดอายุไปแล้วหรือเพิ่งส่งครบ */
  reminders: Array<{ thai: string; when: string }>;
  /** ไม่มีรอบค้างอยู่ = ประโยคบอกสถานะจริง · มีรอบค้าง = null */
  reminderNote: string | null;
  /** ยังต่อไม่ได้ = วันที่เริ่มต่อได้ · ต่อได้แล้ว = null */
  renewOpensOn: string | null;
  actions: DocAction[];
}

declare global {
  interface Window { liff?: any }
}

const REVEAL = 88;  // ความกว้างปุ่มลบที่โผล่มาตอนปัดซ้าย
const OPEN_AT = 44; // ปัดเกินเท่านี้ถือว่าตั้งใจ

/**
 * ไอคอนของปุ่มในถาด — ชุดเดียวกับที่ใช้ในชิปของแชท
 * ป้ายในฐานข้อมูลไม่มี emoji แล้ว (migration 0010) ไอคอนจึงต้องมาจากฝั่งนี้
 */
const ACTION_ICON: Record<ActionKind, string> = {
  upsell: '/icons/spark.png',
  link: '/icons/globe.png',
  map: '/icons/pin.png',
};

function mapUrl(term: string, lat?: number, lng?: number) {
  const q = `https://www.google.com/maps/search/${encodeURIComponent(term)}`;
  return lat != null && lng != null ? `${q}/@${lat},${lng},14z` : q;
}

/** กรอบหน้าเดียวกันสำหรับตอนโหลดและตอนพัง — ไม่ให้ผู้ใช้เห็นหน้าขาวเปล่าที่ไม่รู้ว่าของใคร */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="wrap">
      <header className="hero">
        <div className="hero-img" role="presentation" />
        <div className="hero-bar">
          <img className="logo" src="/brand/logo.png" alt="" width={44} height={44} />
          <h1>เอกสารของฉัน</h1>
        </div>
      </header>
      {children}
    </div>
  );
}

export default function LiffPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [message, setMessage] = useState('');
  const [token, setToken] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null); // ปัดซ้ายค้างไว้ = ปุ่มลบโผล่
  const [trayId, setTrayId] = useState<string | null>(null); // ปัดขวา = ถาดต่ออายุกางอยู่
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const [askArea, setAskArea] = useState(false); // ยังไม่มีพิกัด — ชวนเปิด
  const [areaBusy, setAreaBusy] = useState(false);
  const [leadSent, setLeadSent] = useState<Set<string>>(new Set());
  /** ใบที่กำลังเปิดช่องแก้วันที่อยู่ */
  const [editing, setEditing] = useState<string | null>(null);

  const drag = useRef<{ id: string; startX: number; startY: number; dx: number; locked: boolean } | null>(null);
  /** ปัดจบแล้ว browser ยิง click ตามมาเสมอ — ถ้าไม่กันไว้ การปัดซ้ายจะไปเปิดถาดด้วย */
  const swiped = useRef(false);
  const [dragDx, setDragDx] = useState(0);

  const load = useCallback(async (idToken: string) => {
    const res = await fetch('/api/liff/documents', { headers: { 'x-liff-id-token': idToken } });
    if (!res.ok) throw new Error(`โหลดรายการไม่สำเร็จ (${res.status})`);
    const data = await res.json();
    setDocs(data.documents ?? []);
    return data as { hasArea?: boolean };
  }, []);

  /**
   * เขียนพิกัดกลับเข้าปุ่มแผนที่ทันที ไม่ต้องโหลดรายการใหม่
   * ผู้ใช้เพิ่งกดอนุญาต เขากำลังรอกดปุ่มต่อ
   */
  const applyCoords = useCallback((lat: number, lng: number) => {
    setDocs((prev) =>
      prev.map((d) => ({
        ...d,
        actions: d.actions.map((a) =>
          a.kind === 'map' && a.term ? { ...a, url: mapUrl(a.term, lat, lng) } : a
        ),
      }))
    );
  }, []);

  const sendArea = useCallback(
    async (idToken: string, lat: number, lng: number) => {
      try {
        const res = await fetch('/api/liff/area', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-liff-id-token': idToken },
          body: JSON.stringify({ lat, lng }),
        });
        if (!res.ok) return;
        const saved = await res.json();
        applyCoords(saved.lat, saved.lng);
        setAskArea(false);
      } catch {
        // ไม่ได้พิกัดก็ยังใช้งานได้ครบ — ปุ่มแผนที่ทำงานโดยไม่ต้องมีพิกัดอยู่แล้ว
      }
    },
    [applyCoords]
  );

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
        const data = await load(idToken);
        if (cancelled) return;
        setState('ready');

        /**
         * ขอพิกัดที่นี่ ไม่ใช่ในแชท
         *
         * ในแชท LINE เปิดได้แค่หน้าเลือกสถานที่ ซึ่งไม่รับคำค้นของเรา
         * ผู้ใช้กดปุ่ม "ที่ว่าการอำเภอใกล้ฉัน" แล้วเจอร้านอาหารแถวบ้าน
         *
         * ในเว็บ เบราว์เซอร์จำคำอนุญาตให้ ถามครั้งเดียวใช้ได้ตลอด
         * และถ้าเคยอนุญาตไว้แล้ว อ่านเงียบ ๆ ได้เลยโดยไม่ต้องเด้งถามซ้ำ
         */
        if (!navigator.geolocation) return;
        let status: string | null = null;
        try {
          const p = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
          status = p?.state ?? null;
        } catch {
          // เบราว์เซอร์เก่าไม่มี permissions API — ถือว่ายังไม่เคยถาม
        }
        if (status === 'granted') {
          navigator.geolocation.getCurrentPosition(
            (pos) => { if (!cancelled) sendArea(idToken, pos.coords.latitude, pos.coords.longitude); },
            () => {},
            { maximumAge: 600000, timeout: 8000 }
          );
        } else if (status !== 'denied' && !data?.hasArea) {
          // ไม่เด้ง permission เอง — เด้งแล้วเขากดปฏิเสธ เบราว์เซอร์จำไว้ ขอใหม่ไม่ได้อีก
          // ชวนด้วยแถบเล็ก ๆ ให้เขาเห็นก่อนว่าเราจะเอาไปทำอะไร
          setAskArea(true);
        }
      } catch (err) {
        if (!cancelled) { setMessage(err instanceof Error ? err.message : String(err)); setState('error'); }
      }
    }
    boot();
    return () => { cancelled = true; };
  }, [load, sendArea]);

  function requestArea() {
    if (!token || !navigator.geolocation) return;
    setAreaBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await sendArea(token, pos.coords.latitude, pos.coords.longitude);
        setAreaBusy(false);
      },
      () => { setAreaBusy(false); setAskArea(false); },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  /**
   * แก้วันหมดอายุ
   *
   * แชทให้ปุ่มได้ชุดเดียวต่อข้อความ ส่งรูปมาหลายใบจึงแก้ในแชทได้ใบเดียว
   * ที่นี่แก้ใบไหนก็ได้ ไม่ว่าผ่านมากี่วันแล้ว
   */
  async function saveExpiry(id: string, expiry: string) {
    if (!token || !expiry) return;
    setBusy(true);
    try {
      const res = await fetch('/api/liff/documents', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-liff-id-token': token },
        body: JSON.stringify({ id, expiry }),
      });
      if (res.ok) {
        setEditing(null);
        // โหลดใหม่ทั้งรายการ เพราะรอบเตือนถูกคำนวณใหม่ที่ฝั่งเซิร์ฟเวอร์
        await load(token);
      }
    } finally {
      setBusy(false);
    }
  }

  async function requestLead(doc: Doc) {
    if (!token) return;
    setLeadSent((prev) => new Set(prev).add(doc.id));
    try {
      await fetch('/api/liff/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-liff-id-token': token },
        body: JSON.stringify({ documentId: doc.id }),
      });
    } catch {
      // บันทึกไม่ได้ก็ไม่ต้องทำให้ผู้ใช้ตกใจ เดี๋ยวทักมาในแชทได้อยู่ดี
    }
  }

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
      setTrayId(null);
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

  /* ---- ปัดซ้าย = ลบ / ปัดขวา = ต่ออายุ ---- */
  function onDown(e: React.PointerEvent, id: string) {
    if (selectMode) return;
    drag.current = { id, startX: e.clientX, startY: e.clientY, dx: 0, locked: false };
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    // เลื่อนหน้าลงแล้วนิ้วเบี้ยวนิดหน่อย ไม่ควรกลายเป็นการปัด
    if (!d.locked) {
      if (Math.abs(e.clientY - d.startY) > 12 && Math.abs(dx) < 12) { drag.current = null; setDragDx(0); return; }
      if (Math.abs(dx) < 8) return;
      d.locked = true;
    }
    /**
     * ปุ่มลบโผล่อยู่แล้ว = แถวถูกดันไปทางซ้าย -REVEAL
     * การปัดขวาตอนนี้คือ "เลื่อนกลับที่เดิม" ไม่ใช่การเริ่มท่าใหม่
     * จึงต้องคิดระยะจากตำแหน่งที่แถวอยู่จริง ไม่ใช่จาก 0
     */
    const base = openId === d.id ? -REVEAL : 0;
    d.dx = Math.max(-REVEAL, Math.min(REVEAL, base + dx));
    setDragDx(d.dx);
  }
  function onUp() {
    const d = drag.current;
    drag.current = null;
    setDragDx(0);
    if (!d || !d.locked) return;
    swiped.current = true;
    setTimeout(() => { swiped.current = false; }, 0);

    // กำลังเปิดปุ่มลบอยู่ — ปัดทางไหนก็แค่ตัดสินว่าจะปิดหรือเปิดค้างไว้
    // ห้ามเด้งไปเปิดถาดต่ออายุ เพราะเจตนาของเขาคือ "ขอกลับไปหน้ารายการปกติ"
    if (openId === d.id) {
      if (d.dx > -OPEN_AT) setOpenId(null);
      return;
    }

    if (d.dx < -OPEN_AT) {
      setOpenId(d.id);
      setTrayId(null);
    } else if (d.dx > OPEN_AT) {
      // ถาดกางใต้แถว ไม่ใช่ค้างแถวไว้ทางขวา — ปุ่มภาษาไทยยาวเกินกว่าจะยัดในช่องแคบ
      setTrayId((cur) => (cur === d.id ? null : d.id));
    }
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

  if (state === 'loading') return <Shell><p className="muted">กำลังโหลด…</p></Shell>;
  if (state === 'error') return <Shell><p className="muted">{message}</p></Shell>;

  const allSelected = docs.length > 0 && selected.size === docs.length;

  return (
    <div className="wrap" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {/*
        หัวหน้าเว็บใช้ปกกับโลโก้ชุดเดียวกับ LINE OA
        หน้านี้เปิดจากในแอป LINE ซึ่งไม่มีแถบที่อยู่เว็บให้ดู
        ถ้าไม่มีอะไรบอกว่ายังอยู่กับ "จำให้นะ" คนจะไม่แน่ใจว่าหลุดไปเว็บไหนแล้ว
      */}
      <header className="hero">
        <div className="hero-img" role="presentation" />
        <div className="hero-bar">
          <img className="logo" src="/brand/logo.png" alt="" width={44} height={44} />
          <h1>เอกสารของฉัน</h1>
          {docs.length > 0 && (
            <button
              className="link"
              onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); setOpenId(null); setTrayId(null); }}
            >
              {selectMode ? 'ยกเลิก' : '☑︎ เลือก'}
            </button>
          )}
        </div>
      </header>

      {askArea && !selectMode && docs.length > 0 && (
        <div className="ask">
          <img src="/icons/pin.png" alt="" width={22} height={22} />
          <span className="ask-t">เปิดตำแหน่งไว้ เราจะได้แนะนำที่ใกล้คุณได้ตรงขึ้น</span>
          <button className="link" onClick={requestArea} disabled={areaBusy}>
            {areaBusy ? 'กำลังอ่าน…' : 'เปิด'}
          </button>
          <button className="link mute" onClick={() => setAskArea(false)}>ไม่เอา</button>
        </div>
      )}

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
          <div className="empty">
            {/* หน้าว่างเปล่าคือหน้าที่คนเห็นเป็นหน้าแรกเสมอ ทำให้มันไม่เงียบเกินไป */}
            <img src="/mascot/14-shrug.png" alt="" width={120} height={120} />
            ยังไม่มีเอกสารครับ<br />ส่งรูปเอกสารเข้าแชทได้เลย
          </div>
        ) : (
          docs.map((d) => (
            <div className="item" key={d.id}>
              <div className="swipe">
                <button className="swipe-del" onClick={() => deleteIds([d.id])} disabled={busy}>ลบ</button>
                <div
                  className={`doc${selectMode ? ' picking' : ''}`}
                  style={{ transform: `translateX(${offsetFor(d.id)}px)` }}
                  onPointerDown={(e) => onDown(e, d.id)}
                  onClick={() => {
                    if (swiped.current) return;
                    if (selectMode) return toggle(d.id);
                    // ปุ่มลบเปิดอยู่ แตะที่แถวคือขอปิด ไม่ใช่ขอเปิดถาด
                    if (openId === d.id) return setOpenId(null);
                    // แตะก็เปิดถาดได้ ไม่ใช่ทุกคนจะเดาท่าปัดขวาออก
                    setTrayId((c) => (c === d.id ? null : d.id));
                  }}
                >
                  {selectMode && (
                    <span className={`box${selected.has(d.id) ? ' on' : ''}`} aria-hidden="true" />
                  )}
                  <span className="nm">
                    <img className="tico" src={d.icon} alt="" width={20} height={20} />
                    {d.typeLabel}{d.label ? ` · ${d.label}` : ''}
                  </span>
                  <span className="sb">หมดอายุ {d.expiryThai}</span>
                  <span className={`days ${d.status}`}>
                    {d.days < 0 ? `เลย ${Math.abs(d.days)} วัน` : d.days === 0 ? 'วันนี้' : `เหลือ ${d.days} วัน`}
                  </span>
                </div>
              </div>

              {trayId === d.id && !selectMode && (
                <div className="tray">
                  {/* คำถามแรกของคนที่เปิดดูคือ "แล้วจะเตือนฉันตอนไหน" ตอบก่อนเสมอ */}
                  <div className="sched">
                    {d.reminders.length === 0 ? (
                      <span className="muted">{d.reminderNote}</span>
                    ) : (
                      <>
                        <span className="muted">จะเตือน {d.reminders.length} ครั้ง</span>
                        {d.reminders.map((r) => (
                          <span className="sched-r" key={r.thai}>
                            <span>{r.thai}</span>
                            <span className="muted">{r.when}</span>
                          </span>
                        ))}
                      </>
                    )}
                  </div>

                  {editing === d.id ? (
                    <div className="edit">
                      <input type="date" id={`exp-${d.id}`} defaultValue={d.expiry} />
                      <button
                        className="act primary"
                        disabled={busy}
                        onClick={() => {
                          const el = document.getElementById(`exp-${d.id}`) as HTMLInputElement | null;
                          if (el?.value) saveExpiry(d.id, el.value);
                        }}
                      >
                        {busy ? 'กำลังบันทึก…' : 'บันทึกวันใหม่'}
                      </button>
                      <button className="act" onClick={() => setEditing(null)}>ยกเลิก</button>
                    </div>
                  ) : (
                    <button className="act" onClick={() => setEditing(d.id)}>แก้วันหมดอายุ</button>
                  )}

                  {d.renewOpensOn ? (
                    <p className="muted">ยังไม่ถึงรอบต่อครับ ต่อได้ตั้งแต่ {d.renewOpensOn}</p>
                  ) : d.actions.length === 0 ? (
                    <p className="muted">เอกสารนี้ต่อที่หน่วยงานที่ออกให้ครับ</p>
                  ) : (
                    d.actions.map((a) =>
                      a.kind === 'upsell' ? (
                        <button
                          key={a.label}
                          className="act primary"
                          disabled={leadSent.has(d.id)}
                          onClick={() => requestLead(d)}
                        >
                          {leadSent.has(d.id) ? 'รับเรื่องแล้ว เดี๋ยวทักไปในแชทครับ' : a.label}
                        </button>
                      ) : (
                        <a key={a.label} className="act" href={a.url} target="_blank" rel="noreferrer">
                          <img src={ACTION_ICON[a.kind]} alt="" width={18} height={18} />
                          {a.label}
                        </a>
                      )
                    )
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {!selectMode && docs.length > 0 && (
        <p className="note">← ปัดซ้ายเพื่อลบ · ปัดขวาเพื่อดูวิธีต่ออายุ →</p>
      )}

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
