'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * หลังบ้าน — อ่านอย่างเดียว
 *
 * เข้าด้วย LINE Login แบบเว็บ ไม่ใช่ LIFF — จึงเปิดบนคอมได้ ซึ่งจำเป็น
 * สำหรับงานที่ต้องพิมพ์เยอะอย่างจัดคิวเอกสาร ส่วนปุ่มในไลน์ก็ยังกดเข้ามาได้เหมือนเดิม
 * เพราะเบราว์เซอร์ของ LINE รับคุกกี้ได้ปกติ
 *
 * ตัวตนอยู่ในคุกกี้ที่เซิร์ฟเวอร์เซ็นไว้ หน้าเว็บไม่ต้องถือ token เองเลย
 *
 * สิ่งที่หน้านี้ต้องตอบให้ได้ในสามวินาทีแรก เรียงตามความเร่ง:
 *   1. มีงานเข้าไหม (คนกด "ให้เราต่อให้")
 *   2. เมื่อเช้าเตือนออกไหม มีที่ส่งไม่ออกค้างอยู่ไหม
 *   3. โมเดลอ่านแม่นแค่ไหน
 * ตัวเลขโตช้าอย่างจำนวนผู้ใช้อยู่ล่างสุด เพราะดูวันละครั้งก็พอ
 */

interface Lead {
  at: string;
  atThai: string;
  name: string | null;
  lineUserId: string | null;
  typeLabel: string;
  via: string;
  started: boolean;
}

interface Order {
  id: string;
  status: 'new' | 'accepted' | 'in_progress' | 'done' | 'cancelled';
  service: string;
  name: string | null;
  lineUserId: string;
  atThai: string;
  assignee: string | null;
  note: string | null;
}

interface Member {
  lineUserId: string;
  name: string | null;
  role: 'owner' | 'staff';
  disabled: boolean;
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
  orders: Order[];
  team: Member[];
  me: { userId: string; role: 'owner' | 'staff'; bootstrap: boolean };
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
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'signedout'>('loading');
  const [message, setMessage] = useState('');
  const [data, setData] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [newId, setNewId] = useState('');

  /**
   * ทุกการเขียนโหลดข้อมูลใหม่ทั้งก้อน ไม่แก้ state เอาเอง
   *
   * หน้านี้มีคนใช้พร้อมกันได้ตั้งแต่วันแรกที่มีทีม การเดาสถานะฝั่งหน้าจอ
   * จะทำให้สองคนเห็นคิวไม่ตรงกัน แล้วรับงานชิ้นเดียวกันซ้อน
   */
  const act = useCallback(async (url: string, body: unknown) => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const out = await res.json().catch(() => ({}));
      // บัตรหมดอายุกลางคัน — พากลับไปล็อกอินเลย ดีกว่าขึ้นว่าทำรายการไม่สำเร็จเฉย ๆ
      if (res.status === 401) { window.location.href = '/api/admin/login'; return; }
      if (!res.ok) { setMessage(out.error ?? `ทำรายการไม่สำเร็จ (${res.status})`); return; }
      setMessage('');
      const fresh = await fetch('/api/admin/summary');
      if (fresh.ok) setData(await fresh.json());
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

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

    async function boot() {
      const params = new URLSearchParams(window.location.search);
      const reason = params.get('e');
      // เพิ่งกลับมาจากหน้าล็อกอินสด ๆ — ถ้ายังไม่ผ่านอีก ห้ามเด้งไปล็อกอินซ้ำ
      const justLoggedIn = params.get('ok') === '1';

      if (reason && REASON[reason]) {
        setMessage(REASON[reason]);
        setState('signedout');
        return;
      }

      try {
        const res = await fetch('/api/admin/summary');

        if (res.status === 401) {
          if (justLoggedIn) {
            setMessage('เข้าสู่ระบบแล้วแต่เบราว์เซอร์ไม่เก็บคุกกี้ — ลองปิดโหมดไม่ระบุตัวตน หรือเปิดในเบราว์เซอร์ปกติ');
            setState('signedout');
            return;
          }
          window.location.href = '/api/admin/login';
          return;
        }
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
  if (state === 'signedout') {
    return (
      <Shell>
        <p>{message}</p>
        <p className="acts"><a className="pill" href="/api/admin/login">เข้าสู่ระบบด้วย LINE</a></p>
      </Shell>
    );
  }
  if (state === 'error' || !data) {
    return (
      <Shell>
        <p className="warn">{message}</p>
        <p className="acts"><a className="pill" href="/api/admin/logout">ออกจากระบบ</a></p>
      </Shell>
    );
  }

  const { overview, reminders, reading, leads, orders, team, me } = data;
  const open = orders.filter((o) => ['new', 'accepted', 'in_progress'].includes(o.status));
  const STATUS_TH: Record<Order['status'], string> = {
    new: 'ใหม่', accepted: 'รับงานแล้ว', in_progress: 'กำลังทำ', done: 'เสร็จ', cancelled: 'ยกเลิก',
  };
  // ขั้นถัดไปของแต่ละสถานะ — ปุ่มที่เห็นต้องเป็นปุ่มที่กดแล้วมีความหมายตอนนี้
  const NEXT: Partial<Record<Order['status'], Array<Order['status']>>> = {
    new: ['accepted', 'cancelled'],
    accepted: ['in_progress', 'cancelled'],
    in_progress: ['done', 'cancelled'],
  };
  const cron = reminders.lastCron;
  const cronAt = cron ? new Date(cron.at) : null;
  const cronStale = cronAt ? Date.now() - cronAt.getTime() > 26 * 3600_000 : true;

  return (
    <Shell>
      <p className="note left">ข้อมูล ณ {new Date().toLocaleString('th-TH')}</p>

      {message && <p className="warn">{message}</p>}

      <h2>คิวงาน ({open.length} ชิ้นที่ยังไม่จบ)</h2>
      {open.length === 0 ? (
        <p>ไม่มีงานค้างครับ</p>
      ) : (
        <div className="rows">
          {open.map((o) => (
            <div className="lead" key={o.id}>
              <div className="lead-top">
                <b>{o.name ?? 'ผู้ใช้'}</b>
                <span className={`pill ${o.status}`}>{STATUS_TH[o.status]}</span>
              </div>
              <div className="muted">{o.service} · เปิดงาน {o.atThai}</div>
              {o.note && <div className="muted">{o.note}</div>}
              <div className="acts">
                {(NEXT[o.status] ?? []).map((next) => (
                  <button
                    key={next}
                    className={`btn ${next === 'cancelled' ? 'danger' : 'primary'}`}
                    disabled={busy}
                    onClick={() => act('/api/admin/order', { id: o.id, status: next })}
                  >
                    {STATUS_TH[next]}
                  </button>
                ))}
              </div>
              <code>{o.lineUserId}</code>
            </div>
          ))}
        </div>
      )}

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

      <h2>ทีม</h2>
      <div className="rows">
        {team.length === 0 && <p className="muted">ยังไม่มีใครในตาราง — ตอนนี้เข้าได้ด้วย ADMIN_LINE_USER_ID เท่านั้น</p>}
        {team.map((m) => (
          <div className="lead" key={m.lineUserId}>
            <div className="lead-top">
              <b>{m.name ?? 'ไม่ระบุชื่อ'}</b>
              <span className={`pill ${m.disabled ? 'cancelled' : 'accepted'}`}>
                {m.disabled ? 'ถอดสิทธิ์แล้ว' : m.role}
              </span>
            </div>
            <code>{m.lineUserId}</code>
            {me.role === 'owner' && !m.disabled && m.lineUserId !== me.userId && (
              <div className="acts">
                <button
                  className="btn danger" disabled={busy}
                  onClick={() => act('/api/admin/team', { lineUserId: m.lineUserId, disable: true })}
                >
                  ถอดสิทธิ์
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {me.role === 'owner' && (
        <div className="addrow">
          <input
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            placeholder="LINE user id ของคนที่จะเพิ่ม (U…)"
            spellCheck={false}
          />
          <button
            className="btn primary" disabled={busy || newId.trim().length < 10}
            onClick={() => act('/api/admin/team', { lineUserId: newId.trim(), role: 'staff' }).then(() => setNewId(''))}
          >
            เพิ่มเป็น staff
          </button>
          <p className="note left">
            ให้เขาทักบอทก่อนหนึ่งครั้ง แล้วหารหัสได้จากตาราง users — staff ทำงานในคิวได้ แต่แตะสิทธิ์คนอื่นไม่ได้
          </p>
        </div>
      )}

      <p className="note left">
        ข้อมูลลูกค้าแก้ที่ Supabase — หน้านี้แก้ได้เฉพาะสถานะงานกับสิทธิ์ของทีม
        และทุกการเปลี่ยนแปลงถูกบันทึกว่าใครทำ
      </p>

      {/* เครื่องที่ไม่ใช่ของเรา ต้องมีทางออกที่หาเจอโดยไม่ต้องถามใคร */}
      <p className="acts"><a className="pill" href="/api/admin/logout">ออกจากระบบ</a></p>
    </Shell>
  );
}
