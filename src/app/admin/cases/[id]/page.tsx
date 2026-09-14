'use client';

import { use, useState } from 'react';
import { Shell, Gate, useAdmin } from '../../Shell';
import { STATUS_TH, VEHICLE_FIELDS } from '@/lib/domain/caseWork';

interface EventRow {
  kind: string; at: string; atThai: string; byName: string;
  detail: Record<string, unknown>;
}
interface CaseDetail {
  id: string; status: string; serviceLabel: string;
  name: string | null; lineUserId: string; atThai: string;
  note: string | null; vehicle: Record<string, string>;
  purgeAfterThai: string | null; purged: boolean;
  document: { label: string; expiryThai: string } | null;
  seesMoney: boolean; canEdit: boolean; me: { role: string };
  priceThb: number | null; paid: boolean;
  events: EventRow[];
}

// ขั้นถัดไปของแต่ละสถานะ — ปุ่มที่เห็นต้องเป็นปุ่มที่กดแล้วมีความหมายตอนนี้
const NEXT: Record<string, string[]> = {
  new: ['accepted', 'cancelled'],
  accepted: ['in_progress', 'cancelled'],
  in_progress: ['done', 'cancelled'],
};

/** ไทม์ไลน์ต้องอ่านออกโดยไม่ต้องรู้ชื่อฟิลด์ในฐานข้อมูล */
function say(e: EventRow): string {
  const d = e.detail ?? {};
  if (e.kind === 'created') return d.via === 'manual' ? 'เปิดเคสด้วยมือ' : 'ลูกค้ากด "ให้เราต่อให้"';
  if (e.kind === 'status') return `เปลี่ยนสถานะเป็น ${STATUS_TH[String(d.status)] ?? String(d.status)}`;
  if (e.kind === 'edit') return `แก้ ${(d.changed as string[] ?? []).join(' · ')}`;
  if (e.kind === 'note') return String(d.text ?? '');
  return e.kind;
}

export default function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { state, message, data, busy, act } = useAdmin<CaseDetail>(`/api/admin/cases/${id}`);
  const [note, setNote] = useState('');
  const [price, setPrice] = useState('');
  const [car, setCar] = useState<Record<string, string> | null>(null);

  if (state !== 'ready' || !data) return <Gate state={state} message={message} />;
  const url = `/api/admin/cases/${id}`;
  const vehicle = car ?? data.vehicle ?? {};

  return (
    <Shell role={data.me.role}>
      <p className="note left"><a href="/admin/cases">← กลับไปรายการเคส</a></p>

      <h2>{data.name ?? 'ผู้ใช้'} · {data.serviceLabel}</h2>
      {message && <p className="warn">{message}</p>}

      <div className="lead">
        <div className="lead-top">
          <b>สถานะ</b>
          <span className={`pill ${data.status}`}>{STATUS_TH[data.status] ?? data.status}</span>
        </div>
        <div className="muted">
          เปิดเคส {data.atThai}
          {data.document && ` · จาก${data.document.label} หมด ${data.document.expiryThai}`}
        </div>
        <code>{data.lineUserId}</code>
        {data.canEdit && (
          <div className="acts">
            {(NEXT[data.status] ?? []).map((next) => (
              <button
                key={next}
                className={`btn ${next === 'cancelled' ? 'danger' : 'primary'}`}
                disabled={busy}
                onClick={() => act(url, { status: next })}
              >
                {STATUS_TH[next]}
              </button>
            ))}
          </div>
        )}
      </div>

      {data.seesMoney && (
        <>
          <h2>เงิน</h2>
          <div className="lead">
            <div className="addrow">
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder={data.priceThb != null ? `ตอนนี้ ${data.priceThb} บาท` : 'ราคาที่ตกลงกับลูกค้า (บาท)'}
              />
              <button
                className="btn" disabled={busy || !price.trim()}
                onClick={() => act(url, { priceThb: Number(price) }).then(() => setPrice(''))}
              >
                บันทึกราคา
              </button>
            </div>
            <div className="acts">
              <button
                className={`btn ${data.paid ? '' : 'primary'}`} disabled={busy}
                onClick={() => act(url, { paid: !data.paid })}
              >
                {data.paid ? 'ยกเลิกว่ารับเงินแล้ว' : 'รับเงินแล้ว'}
              </button>
            </div>
            {data.paid && <p className="note left ok">บันทึกว่ารับเงินแล้ว</p>}
          </div>
        </>
      )}

      <h2>ข้อมูลรถ</h2>
      <p className="note left">
        เก็บเท่าที่โบรกเกอร์ต้องใช้ และล้างทิ้งอัตโนมัติ 7 วันหลังปิดเคส
        {data.purgeAfterThai && ` — ชุดนี้จะถูกล้างวันที่ ${data.purgeAfterThai}`}
        {data.purged && ' (ล้างไปแล้ว)'}
      </p>
      <div className="lead">
        <div className="fields">
          {VEHICLE_FIELDS.map((f) => (
            <label key={f.key}>
              <span>{f.label}</span>
              <input
                value={vehicle[f.key] ?? ''}
                disabled={!data.canEdit || data.purged}
                onChange={(e) => setCar({ ...vehicle, [f.key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        {data.canEdit && car && (
          <div className="acts">
            <button className="btn primary" disabled={busy} onClick={() => act(url, { vehicle }).then(() => setCar(null))}>
              บันทึกข้อมูลรถ
            </button>
            <button className="btn" disabled={busy} onClick={() => setCar(null)}>ยกเลิก</button>
          </div>
        )}
      </div>

      <h2>บันทึกการคุย</h2>
      <div className="addrow">
        <input
          value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="คุยอะไรกับลูกค้าไว้บ้าง"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && note.trim()) act(url, { addNote: note }).then(() => setNote(''));
          }}
        />
        <button
          className="btn primary" disabled={busy || !note.trim()}
          onClick={() => act(url, { addNote: note }).then(() => setNote(''))}
        >
          จดไว้
        </button>
      </div>

      {/* เรียงใหม่อยู่บน — ของที่เพิ่งเกิดคือของที่กำลังหาอยู่ */}
      <div className="timeline">
        {[...data.events].reverse().map((e, i) => (
          <div className="tl" key={`${e.at}-${i}`}>
            <span className="tl-when">{e.atThai}</span>
            <span className="tl-what">{say(e)}</span>
            <span className="tl-who">{e.byName}</span>
          </div>
        ))}
      </div>
    </Shell>
  );
}
