function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}
function opt(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const env = {
  line: {
    get secret() { return req('LINE_CHANNEL_SECRET'); },
    get token()  { return req('LINE_CHANNEL_ACCESS_TOKEN'); },
    /** channel ID ของ LINE Login channel (ตัวเลขล้วน) — คนละตัวกับ Messaging API */
    get loginChannelId() { return req('LINE_LOGIN_CHANNEL_ID'); },
    /**
     * secret ของ LINE Login channel — ใช้ตอนแลก code เป็น id_token เท่านั้น
     * คนละตัวกับ LINE_CHANNEL_SECRET ซึ่งเป็นของ Messaging API
     * ห้ามมี NEXT_PUBLIC_ นำหน้าเด็ดขาด ไม่งั้นมันจะถูกฝังลงหน้าเว็บ
     */
    get loginChannelSecret() { return req('LINE_LOGIN_CHANNEL_SECRET'); },
  },
  supabase: {
    get url() { return req('NEXT_PUBLIC_SUPABASE_URL'); },
    get serviceKey() { return req('SUPABASE_SERVICE_ROLE_KEY'); },
  },
  openai: {
    get key() { return req('OPENAI_API_KEY'); },
    get model() { return opt('OPENAI_VISION_MODEL', 'gpt-4o'); },
    /** อ่านข้อความที่พิมพ์มา — งานง่ายกว่าอ่านรูปมาก ใช้ตัวเล็กพอ */
    get textModel() { return opt('OPENAI_TEXT_MODEL', 'gpt-4o-mini'); },
  },
  get cronSecret() { return req('CRON_SECRET'); },
  /**
   * กุญแจเซ็นคุกกี้หลังบ้าน — เปลี่ยนค่านี้เมื่อไหร่ คนที่ล็อกอินค้างไว้หลุดหมด
   * ซึ่งเป็นวิธีไล่ทุกคนออกจากระบบที่เร็วที่สุดตอนสงสัยว่ามีของรั่ว
   */
  get adminSessionSecret() { return req('ADMIN_SESSION_SECRET'); },
  /**
   * LINE user id ของเจ้าของระบบ — ปลายทางของรายงานหลัง cron ทุกรอบ
   *
   * ไม่ตั้งก็ไม่พัง แค่ไม่มีรายงาน (opt ไม่ใช่ req) เพราะระบบเตือนลูกค้า
   * ต้องไม่ล้มเพราะเรื่องภายในบ้านของเราเอง
   */
  get adminUserIds() {
    return opt('ADMIN_LINE_USER_ID').split(',').map((v) => v.trim()).filter(Boolean);
  },
  /**
   * ต้องมีเสมอ — ไม่มี fallback
   * ลิงก์ /liff แบบธรรมดาเปิดนอกแอป LINE ไม่ได้อยู่แล้ว (liff.init จะพัง)
   * การส่งลิงก์เสียให้ผู้ใช้แย่กว่าการล้มดัง ๆ ตรงนี้
   */
  get liffUrl() { return `https://liff.line.me/${req('NEXT_PUBLIC_LIFF_ID')}`; },
  /**
   * ใช้ประกอบ URL ของไอคอนในปุ่ม quick reply
   *
   * ตั้งใจให้ไม่มีแล้วไม่พัง — ไอคอนหายไปเฉย ๆ ปุ่มยังกดได้เหมือนเดิม
   * การทำให้ทั้งบอทเงียบเพราะไอคอนไม่ขึ้น เป็นการแลกที่ไม่คุ้ม
   */
  get baseUrl() { return opt('NEXT_PUBLIC_BASE_URL').replace(/\/+$/, ''); },
};
