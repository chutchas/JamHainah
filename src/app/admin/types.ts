/** รูปร่างข้อมูลที่ /api/admin/summary ส่งกลับมา — ใช้ร่วมกันหลายหน้า */
export interface Lead {
  at: string; atThai: string; name: string | null; lineUserId: string | null;
  typeLabel: string; via: string; started: boolean;
}

export interface Order {
  id: string;
  status: 'new' | 'accepted' | 'in_progress' | 'done' | 'cancelled';
  service: string; name: string | null; lineUserId: string; atThai: string;
  assignee: string | null; note: string | null;
  priceThb: number | null; paid: boolean;
}

export interface Member {
  lineUserId: string; name: string | null; role: string; disabled: boolean;
}

export interface Summary {
  today: string;
  overview: {
    users: number; unfollowed: number; docs: number; confirmed: number;
    reachable: number; started: number; startedPct: number; docsPerActive: number;
    confirmedPct: number;
  };
  reminders: {
    pendingToday: number; failedQueue: number; sentWeek: number;
    lastCron: null | {
      at: string; messages?: number; users?: number; failed?: number; estimated_cost_thb?: number;
    };
  };
  reading: {
    readOk: number; corrected: number; accuracy: number | null;
    missed: number; notDocument: number; ocrError: number; limitHit: number; aiCalls: number;
  };
  leads: Lead[];
  orders: Order[];
  team: Member[];
  me: { userId: string; role: string; bootstrap: boolean; seesMoney: boolean };
}

/** /api/admin/reminders */
export interface StuckItem {
  id: string;
  kind: 'upcoming' | 'due';
  status: string;
  error: string | null;
  sendOn: string;
  lateDays: number;
  typeLabel: string;
  expiry: string | null;
  expired: boolean;
  dead: boolean;
}

export interface StuckPerson {
  lineUserId: string; name: string | null; blocked: boolean;
  upcoming: number; due: number; messages: number;
  items: StuckItem[];
}
