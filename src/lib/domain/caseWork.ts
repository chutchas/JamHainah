/**
 * คำศัพท์ของงาน "ต่อให้" — ที่เดียวที่ตั้งชื่อบริการและช่องข้อมูลรถ
 *
 * อยู่ใน lib ไม่ใช่ในไฟล์ route เพราะ Next.js ยอมให้ route export ได้เฉพาะ
 * ชื่อที่มันรู้จัก (GET, POST, runtime, dynamic) — export อย่างอื่นจะพังตอน build
 */

/** ต้องตรงกับ orders_service_check ใน migration 0014 */
export const SERVICES = ['cmi', 'vehicle_tax', 'motor_insurance', 'other'] as const;
export type Service = (typeof SERVICES)[number];

export const SERVICE_TH: Record<string, string> = {
  cmi: 'พ.ร.บ.',
  vehicle_tax: 'ภาษีรถ',
  motor_insurance: 'ประกันรถ',
  other: 'อื่น ๆ',
};

/**
 * ช่องข้อมูลรถที่โบรกเกอร์ขอ — เท่าที่ต้องใช้ ไม่เกินนั้น
 * ทั้งก้อนถูกล้างอัตโนมัติ 7 วันหลังปิดเคส (migration 0014)
 * เพิ่มช่องใหม่ที่นี่ที่เดียว แล้วทั้งฟอร์มและตัวกรองฝั่งเซิร์ฟเวอร์รู้พร้อมกัน
 */
export const VEHICLE_FIELDS = [
  { key: 'plate',    label: 'ทะเบียนรถ' },
  { key: 'province', label: 'จังหวัดที่จดทะเบียน' },
  { key: 'brand',    label: 'ยี่ห้อ/รุ่น' },
  { key: 'chassis',  label: 'เลขตัวถัง' },
  { key: 'phone',    label: 'เบอร์ติดต่อ' },
] as const;

export const STATUS_TH: Record<string, string> = {
  new: 'ใหม่', accepted: 'รับงานแล้ว', in_progress: 'กำลังทำ', done: 'เสร็จ', cancelled: 'ยกเลิก',
};
