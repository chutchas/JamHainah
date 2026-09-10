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
  },
  supabase: {
    get url() { return req('NEXT_PUBLIC_SUPABASE_URL'); },
    get serviceKey() { return req('SUPABASE_SERVICE_ROLE_KEY'); },
  },
  openai: {
    get key() { return req('OPENAI_API_KEY'); },
    get model() { return opt('OPENAI_VISION_MODEL', 'gpt-4o'); },
  },
  get cronSecret() { return req('CRON_SECRET'); },
  /**
   * ต้องมีเสมอ — ไม่มี fallback
   * ลิงก์ /liff แบบธรรมดาเปิดนอกแอป LINE ไม่ได้อยู่แล้ว (liff.init จะพัง)
   * การส่งลิงก์เสียให้ผู้ใช้แย่กว่าการล้มดัง ๆ ตรงนี้
   */
  get liffUrl() { return `https://liff.line.me/${req('NEXT_PUBLIC_LIFF_ID')}`; },
};
