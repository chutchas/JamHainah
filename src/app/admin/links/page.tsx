'use client';

import { useState } from 'react';
import { Shell, Gate, useAdmin } from '../Shell';
import { ACTION_KIND_TH, LABEL_MAX, checkLabel, checkUrl, checkSearchTerm } from '@/lib/domain/actionRules';

interface Action {
  id: string; docType: string; docLabel: string;
  kind: 'upsell' | 'link' | 'location';
  label: string; url: string | null; searchTerm: string | null; mapsUrl: string | null;
  enabled: boolean; verifiedAt: string | null; verifiedAgo: number | null; stale: boolean;
}
interface Payload { me: { role: string }; canEdit: boolean; actions: Action[] }

/**
 * ปุ่มต่ออายุ — ปุ่มที่ติดไปกับข้อความเตือนของเอกสารแต่ละประเภท
 *
 * ลิงก์ราชการเน่าแน่นอนและพังเงียบ ๆ ลูกค้ากดแล้วเจอหน้าขาว แล้วคิดว่าบอทเราพัง
 * หน้านี้มีไว้ให้เจอก่อนลูกค้าเจอ — เรียงอันที่น่าสงสัยที่สุดไว้บนสุดของแต่ละกลุ่ม
 */
export default function Links() {
  const { state, message, data, busy, flash, act, post, reload } = useAdmin<Payload>('/api/admin/links');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ label: string; url: string; searchTerm: string }>({ label: '', url: '', searchTerm: '' });
  const [results, setResults] = useState<Record<string, { alive: boolean; say: string }>>({});
  const [sweeping, setSweeping] = useState(false);

  if (state !== 'ready' || !data) return <Gate state={state} message={message} />;

  const groups = new Map<string, Action[]>();
  for (const a of data.actions) {
    const g = groups.get(a.docLabel) ?? [];
    g.push(a);
    groups.set(a.docLabel, g);
  }
  const links = data.actions.filter((a) => a.kind === 'link' && a.enabled);
  const stale = links.filter((a) => a.stale).length;

  async function check(a: Action) {
    const out = await post('/api/admin/links', { id: a.id, op: 'check' });
    if (out) setResults((r) => ({ ...r, [a.id]: { alive: !!out.alive, say: String(out.note ?? '') } }));
    return out;
  }

  /** ตรวจทีละอัน ไม่ยิงพร้อมกัน — เว็บราชการบางที่ตัดการเชื่อมต่อถ้าโดนถี่ ๆ */
  async function checkAll() {
    setSweeping(true);
    for (const a of links) await check(a);
    setSweeping(false);
    await reload();
  }

  function startEdit(a: Action) {
    setEditing(a.id);
    setDraft({ label: a.label, url: a.url ?? '', searchTerm: a.searchTerm ?? '' });
  }

  async function save(a: Action) {
    const body: Record<string, string> = { id: a.id, op: 'edit', label: draft.label };
    if (a.kind === 'link') body.url = draft.url;
    if (a.kind === 'location') body.searchTerm = draft.searchTerm;
    const out = await act('/api/admin/links', body);
    if (out) setEditing(null);
  }

  // ตรวจในหน้าเว็บก่อน ให้เห็นทันทีตอนพิมพ์ — เซิร์ฟเวอร์ตรวจซ้ำอีกรอบอยู่ดี
  const draftError = (a: Action) =>
    checkLabel(draft.label)
    ?? (a.kind === 'link' ? checkUrl(draft.url) : null)
    ?? (a.kind === 'location' ? checkSearchTerm(draft.searchTerm) : null);

  return (
    <Shell role={data.me.role} onRefresh={reload} busy={busy || sweeping} flash={flash}>
      <h2>ปุ่มต่ออายุ</h2>
      {message && <p className="warn">{message}</p>}
      <p className="note left">
        ปุ่มที่ติดไปกับข้อความเตือน — แก้ที่นี่แล้วลูกค้าทุกคนเห็นทันที ไม่ต้อง deploy ใหม่
      </p>

      <div className="tiles">
        <div className={`tile ${stale > 0 ? 'bad' : ''}`}>
          <span className="n">{stale}</span>
          <span className="l">ลิงก์ที่ไม่ได้ตรวจเกิน 90 วัน</span>
        </div>
        <div className="tile">
          <span className="n">{links.length}</span>
          <span className="l">ลิงก์เว็บไซต์ที่เปิดอยู่</span>
        </div>
      </div>
      <div className="acts">
        <button className="btn primary" disabled={busy || sweeping || links.length === 0} onClick={checkAll}>
          {sweeping ? 'กำลังตรวจ…' : `ตรวจลิงก์ทั้งหมด (${links.length})`}
        </button>
      </div>

      {!data.canEdit && (
        <p className="note left">คุณกดตรวจได้ แต่แก้หรือปิดปุ่มได้เฉพาะหัวหน้าขึ้นไป</p>
      )}

      {[...groups].map(([doc, items]) => (
        <section key={doc}>
          <h2>{doc}</h2>
          <div className="rows">
            {items.map((a) => {
              const r = results[a.id];
              const isEditing = editing === a.id;
              const err = isEditing ? draftError(a) : null;
              return (
                <div className={`lead ${a.enabled ? '' : 'offcard'}`} key={a.id}>
                  <div className="lead-top">
                    <b>{a.label}</b>
                    <span className="pill">{ACTION_KIND_TH[a.kind] ?? a.kind}</span>
                  </div>

                  {a.kind === 'link' && a.url && (
                    <a className="muted linkline" href={a.url} target="_blank" rel="noreferrer">{a.url}</a>
                  )}
                  {a.kind === 'location' && (
                    <div className="muted">
                      ค้นว่า &ldquo;{a.searchTerm}&rdquo;
                      {a.mapsUrl && <> · <a href={a.mapsUrl} target="_blank" rel="noreferrer">ลองเปิดแผนที่</a></>}
                    </div>
                  )}
                  {a.kind === 'upsell' && <div className="muted">เปิดเคสในแท็บเคส — ไม่มีลิงก์ให้ตรวจ</div>}

                  <div className="stuckrow">
                    {!a.enabled && <span className="tagx off">ปิดอยู่ ลูกค้าไม่เห็น</span>}
                    {a.kind === 'link' && a.enabled && (
                      a.verifiedAgo === null
                        ? <span className="tagx warn">ยังไม่เคยตรวจ</span>
                        : <span className={`tagx ${a.stale ? 'warn' : ''}`}>
                            ตรวจล่าสุด {a.verifiedAgo === 0 ? 'วันนี้' : `${a.verifiedAgo} วันก่อน`}
                          </span>
                    )}
                    {r && <span className={`tagx ${r.alive ? 'ok' : 'failed'}`}>{r.say.split(': ').pop()}</span>}
                  </div>

                  {isEditing ? (
                    <div className="fields">
                      <label>
                        <span>ป้ายปุ่ม ({[...draft.label.trim()].length}/{LABEL_MAX})</span>
                        <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
                      </label>
                      {a.kind === 'link' && (
                        <label>
                          <span>ลิงก์ (เปลี่ยนแล้วต้องกดตรวจใหม่)</span>
                          <input value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} spellCheck={false} />
                        </label>
                      )}
                      {a.kind === 'location' && (
                        <label>
                          <span>คำที่ใช้ค้นในแผนที่</span>
                          <input value={draft.searchTerm} onChange={(e) => setDraft({ ...draft, searchTerm: e.target.value })} />
                        </label>
                      )}
                      {err && <p className="warn">{err}</p>}
                      <div className="acts">
                        <button className="btn primary" disabled={busy || !!err} onClick={() => save(a)}>บันทึก</button>
                        <button className="btn" onClick={() => setEditing(null)}>ยกเลิก</button>
                      </div>
                    </div>
                  ) : (
                    <div className="acts">
                      {a.kind === 'link' && a.enabled && (
                        <button className="btn" disabled={busy || sweeping} onClick={() => check(a).then(() => reload())}>ตรวจ</button>
                      )}
                      {/*
                        เซิร์ฟเวอร์เปิดไม่ได้ไม่ได้แปลว่าลิงก์เสีย — เว็บราชการหลายแห่งกันเครื่องจากต่างประเทศ
                        ให้คนเปิดดูเองแล้วยืนยัน ดีกว่าปล่อยให้ช่องแดงค้างจนแยกไม่ออกว่าอันไหนเสียจริง
                      */}
                      {a.kind === 'link' && a.enabled && ((r && !r.alive) || a.stale) && (
                        <button
                          className="btn" disabled={busy || sweeping}
                          title="กดลิงก์ด้านบนเปิดดูก่อน ถ้าเปิดได้ค่อยกดปุ่มนี้"
                          onClick={() => {
                            if (window.confirm(`เปิดลิงก์ ${a.label} ดูแล้ว และหน้าเว็บขึ้นปกติใช่ไหม`)) {
                              act('/api/admin/links', { id: a.id, op: 'confirm' })
                                .then(() => setResults((x) => { const y = { ...x }; delete y[a.id]; return y; }));
                            }
                          }}
                        >
                          เปิดดูแล้ว ใช้ได้
                        </button>
                      )}
                      {data.canEdit && a.kind !== 'upsell' && (
                        <button className="btn" disabled={busy} onClick={() => startEdit(a)}>แก้</button>
                      )}
                      {data.canEdit && (
                        <button
                          className={`btn ${a.enabled ? 'danger' : ''}`} disabled={busy}
                          onClick={() => act('/api/admin/links', { id: a.id, op: 'toggle' })}
                        >
                          {a.enabled ? 'ปิดปุ่มนี้' : 'เปิดกลับ'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <p className="note left">
        ปิดปุ่มแทนการลบ — ลิงก์ราชการที่ล่มชั่วคราวมักกลับมา และเปิดคืนได้ในคลิกเดียว
        <br />
        ลิงก์ที่ตรวจไม่ผ่านเพราะเว็บกันบอท ให้กดลิงก์เปิดดูเอง ถ้าขึ้นปกติกด &ldquo;เปิดดูแล้ว ใช้ได้&rdquo;
        — เซิร์ฟเวอร์เราอยู่ต่างประเทศ เว็บราชการบางแห่งจึงไม่ยอมให้เข้า
      </p>
    </Shell>
  );
}
