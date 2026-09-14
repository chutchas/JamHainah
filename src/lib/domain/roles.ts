/**
 * ระดับสิทธิ์ในทีม — ชื่อและความหมาย
 *
 * ไฟล์นี้ไม่แตะฐานข้อมูลเลย เพื่อให้หน้าเว็บ import ได้โดยไม่ลาก supabase
 * ทั้งก้อนเข้าไปอยู่ในโค้ดที่ส่งให้เบราว์เซอร์
 */
export const ADMIN_ROLES = ['owner', 'manager', 'staff'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ROLE_TH: Record<AdminRole, string> = {
  owner: 'เจ้าของระบบ',
  manager: 'หัวหน้า',
  staff: 'พนักงาน',
};

/** เขียนให้คนที่กำลังจะเลือกระดับให้เพื่อนร่วมงาน อ่านแล้วตัดสินใจได้เลย */
export const ROLE_WHAT: Record<AdminRole, string> = {
  owner: 'ทำได้ทุกอย่าง รวมถึงเพิ่มถอดและเปลี่ยนระดับคนในทีม',
  manager: 'จัดคิว เปิดปิดเคส ยิงเตือนซ้ำ และเห็นราคากับค่าใช้จ่าย แต่แตะสิทธิ์คนอื่นไม่ได้',
  staff: 'ทำงานในคิวและจดบันทึกได้ แต่ไม่เห็นตัวเลขเงิน และยิงเตือนซ้ำไม่ได้',
};
