import type { SessionRecord } from "../core/coach/rules.ts";
import type { CheckIn } from "../core/analytics.ts";
import type { Level } from "../core/exercises/types.ts";
import { normalizeSession } from "../core/merge.ts";
import type { SessionRow } from "../core/merge.ts";
import { readParqRecord } from "../core/parq.ts";
import type { ParqRecord } from "../core/parq.ts";
import { DEFAULT_WEEKLY_GOAL } from "../core/streaks.ts";
import { notifyLocalDataChanged } from "./cloud-events.ts";
import { showToast } from "./ui.ts";
import { t } from "./i18n.ts";

// طبقة تخزين محلية (localStorage). السجلات على الجهاز، وبتتزامن مع حساب سحابي بس بعد تسجيل الدخول وموافقة المستخدم.
// كل عنصر (جلسة/دواء/إدخال يومي) ليه updatedAt وحذفه tombstone، عشان الدمج بين الأجهزة يشتغل على مستوى العنصر.

export type FontSize = "normal" | "large" | "xlarge";
export type Theme = "auto" | "light" | "dark";

export interface Settings {
  level: Level;
  fontSize: FontSize;
  muted: boolean;
  facing: "user" | "environment";
  accepted: boolean; // وافق على شاشة الترحيب وإخلاء المسؤولية
  theme: Theme;
  weeklyGoal: number; // عدد أيام التمرين المستهدفة أسبوعيًا
  // عادي (full) أو دقة أعلى (heavy)
  poseModel?: "standard" | "high";
  updatedAt?: number;
}

const DEFAULT_SETTINGS: Settings = { level: "normal", fontSize: "normal", muted: false, facing: "user", accepted: false, theme: "auto", weeklyGoal: DEFAULT_WEEKLY_GOAL, poseModel: "standard" };
const K = { sessions: "hm.sessions", checkins: "hm.checkins", settings: "hm.settings", parq: "hm.parq" } as const;
/** كل مفاتيح الجهاز اللي "مسح كل البيانات" لازم يشيلها */
export const ALL_LOCAL_KEYS = [
  ...Object.values(K), "hm.medications", "hm.routine", "hm.assistant.chat", "hm.assistant.summary-consent",
  "hm.cloud.owner", "hm.cloud.consent", "hm.cloud.lastSync", "hm.med.notified", "hm.push.enabled", "hm.profile", "hm.meals", "hm.food.photo-consent",
] as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    notifyLocalDataChanged();
    return true;
  } catch {
    showToast(t("storageUnavailable")); // التخزين ممتلئ أو ممنوع: المستخدم لازم يعرف إن الحفظ ما تمّش
    return false;
  }
}

function allSessions(): SessionRow[] {
  const raw = read<unknown>(K.sessions, []);
  return (Array.isArray(raw) ? raw : []).map(normalizeSession).filter((row): row is SessionRow => row !== null);
}

export const store = {
  getSettings: (): Settings => ({ ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(K.settings, {}) }),
  saveSettings: (s: Settings) => write(K.settings, { ...s, updatedAt: Date.now() }),

  /** الجلسات الظاهرة (من غير المحذوفة) */
  getSessions: (): SessionRow[] => allSessions().filter((row) => !row.deleted),
  addSession(s: SessionRecord) {
    const now = Date.now();
    write(K.sessions, [...allSessions(), { ...s, id: crypto.randomUUID(), updatedAt: now }]);
  },
  /** حذف = tombstone (مش مسح الصف)، عشان الحذف ينتقل للأجهزة التانية ومترجعش الجلسة بالمزامنة */
  deleteSession(id: string) {
    const now = Date.now();
    write(K.sessions, allSessions().map((row) => (row.id === id ? { ...row, deleted: true, updatedAt: now } : row)));
  },

  getCheckins: (): Record<string, CheckIn> => read<Record<string, CheckIn>>(K.checkins, {}),
  saveCheckin(dateKey: string, c: CheckIn) {
    write(K.checkins, { ...store.getCheckins(), [dateKey]: { ...c, updatedAt: Date.now() } });
  },

  getParq: (): ParqRecord | null => readParqRecord(read<unknown>(K.parq, null)),
  saveParq(record: ParqRecord) { write(K.parq, record); },

  clearAll() {
    for (const key of ALL_LOCAL_KEYS) localStorage.removeItem(key);
  },
};
