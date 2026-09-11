/**
 * "เตือนแล้วต้องไปทำที่ไหน" — สิ่งที่ทำให้การเตือนมีประโยชน์จริง
 *
 * เอกสารแต่ละอย่างต่ออายุคนละวิธี ปุ่มที่ติดไปกับข้อความเตือนจึงต้องต่างกัน
 *   upsell    เรารับทำให้ได้      = ทางที่เราได้เงิน
 *   link      ทำออนไลน์ได้        = ลิงก์ราชการ
 *   location  ต้องไปด้วยตัวเอง    = ขอพิกัดแล้วเปิดแผนที่ให้
 *
 * เอกสารที่หาเงินไม่ได้ (บัตรประชาชน พาสปอร์ต) ยังต้องมีประโยชน์
 * ไม่งั้นการเตือนจะกลายเป็นแค่การรบกวน
 *
 * ─────────────────────────────────────────────────────────────
 * ค่าในไฟล์นี้เป็นแค่ "ค่าตั้งต้น" ของจริงอยู่ในตาราง renew_actions
 *
 * เพราะลิงก์ราชการเน่าแน่นอน และการแก้ลิงก์เสียหนึ่งอัน
 * ไม่ควรต้อง deploy ใหม่ทั้งระบบ
 * ─────────────────────────────────────────────────────────────
 */
import { db } from '@/lib/db/client';

export type RenewActionKind = 'upsell' | 'link' | 'location';

export interface RenewAction {
  kind: RenewActionKind;
  label: string;
  /** kind = link */
  url?: string | null;
  /** kind = location */
  searchTerm?: string | null;
}

/** ใช้ตอน seed และเป็นตาข่ายรองถ้าอ่านฐานข้อมูลไม่ได้ */
export const DEFAULT_RENEW_ACTIONS: Record<string, RenewAction[]> = {
  vehicle_tax: [
    { kind: 'upsell', label: '🛵 ให้เราต่อให้' },
    { kind: 'link', label: '💻 ต่อภาษีออนไลน์', url: 'https://eservice.dlt.go.th' },
    { kind: 'location', label: '📍 ตรอ. ใกล้ฉัน', searchTerm: 'ตรอ. ตรวจสภาพรถ' },
  ],
  cmi: [
    { kind: 'upsell', label: '🛵 ให้เราต่อให้' },
    { kind: 'location', label: '📍 ร้านต่อ พ.ร.บ. ใกล้ฉัน', searchTerm: 'ต่อ พ.ร.บ. ประกันภัยรถ' },
  ],
  motor_insurance: [{ kind: 'upsell', label: '🛵 ให้เราเทียบราคาให้' }],
  vehicle_inspection: [
    { kind: 'location', label: '📍 ตรอ. ใกล้ฉัน', searchTerm: 'ตรอ. ตรวจสภาพรถ' },
  ],
  driving_license: [
    // ต้องอบรมออนไลน์ให้เสร็จก่อนถึงจะไปต่อที่สำนักงานได้ ลำดับปุ่มจึงสำคัญ
    { kind: 'link', label: '💻 อบรมออนไลน์ก่อน', url: 'https://www.dlt.go.th' },
    { kind: 'location', label: '📍 สำนักงานขนส่งใกล้ฉัน', searchTerm: 'สำนักงานขนส่งจังหวัด' },
  ],
  national_id: [
    { kind: 'location', label: '📍 ที่ว่าการอำเภอใกล้ฉัน', searchTerm: 'ที่ว่าการอำเภอ สำนักงานเขต' },
  ],
  passport: [
    { kind: 'link', label: '💻 จองคิวทำพาสปอร์ต', url: 'https://consular.mfa.go.th' },
    { kind: 'location', label: '📍 สำนักงานหนังสือเดินทาง', searchTerm: 'สำนักงานหนังสือเดินทาง' },
  ],
  social_security: [
    { kind: 'link', label: '💻 ประกันสังคมออนไลน์', url: 'https://www.sso.go.th' },
    { kind: 'location', label: '📍 สนง.ประกันสังคมใกล้ฉัน', searchTerm: 'สำนักงานประกันสังคม' },
  ],
  visa: [
    { kind: 'link', label: '💻 ตรวจคนเข้าเมือง', url: 'https://www.immigration.go.th' },
    { kind: 'location', label: '📍 สนง.ตม. ใกล้ฉัน', searchTerm: 'สำนักงานตรวจคนเข้าเมือง' },
  ],
  work_permit: [
    { kind: 'location', label: '📍 สนง.จัดหางานใกล้ฉัน', searchTerm: 'สำนักงานจัดหางานจังหวัด' },
  ],
};

/**
 * อ่านจากฐานข้อมูล — แก้ผ่าน Supabase Table Editor ได้ทันทีโดยไม่ต้อง deploy
 * ถ้าอ่านไม่ได้หรือตารางว่าง ใช้ค่าตั้งต้นแทน ระบบต้องไม่ล้มเพราะเรื่องปุ่ม
 */
export async function loadRenewActions(): Promise<Record<string, RenewAction[]>> {
  try {
    const { data, error } = await db()
      .from('renew_actions')
      .select('doc_type, kind, label, url, search_term, sort_order')
      .eq('enabled', true)
      .order('doc_type')
      .order('sort_order');

    if (error || !data || data.length === 0) return DEFAULT_RENEW_ACTIONS;

    const out: Record<string, RenewAction[]> = {};
    for (const r of data as Array<Record<string, string>>) {
      (out[r.doc_type] ??= []).push({
        kind: r.kind as RenewActionKind,
        label: r.label,
        url: r.url,
        searchTerm: r.search_term,
      });
    }
    return out;
  } catch {
    return DEFAULT_RENEW_ACTIONS;
  }
}

/**
 * ลิงก์ค้นหาบน Google Maps
 *
 * ใช้ URL ล้วน ไม่ต้องใช้ Places API — ไม่มีค่าใช้จ่าย ไม่มี key ให้ดูแล
 * และผลลัพธ์อัปเดตเองตลอด ดีกว่าฐานข้อมูลร้านที่เราต้องมาไล่ดูแลเอง
 *
 * ไม่ส่งพิกัดมาก็ใช้ได้ — Google Maps ใช้ตำแหน่งของเครื่องเอง
 * ปุ่มที่เขียนว่า "ใกล้ฉัน" จึงต้องค้นหาให้ทันทีที่กด
 * ไม่ใช่เปิดหน้าเลือกสถานที่เปล่า ๆ แล้วรอให้ผู้ใช้พิมพ์เอง
 */
export function mapsSearchUrl(searchTerm: string, lat?: number, lng?: number): string {
  const q = `https://www.google.com/maps/search/${encodeURIComponent(searchTerm)}`;
  // มีพิกัดก็ปักหมุดให้ตรงขึ้น (ใช้ตอนผู้ใช้แชร์ตำแหน่งมาเอง)
  return lat != null && lng != null ? `${q}/@${lat},${lng},14z` : q;
}
