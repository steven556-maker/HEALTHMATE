// منطق الأدوية الصافي (بدون DOM). لا يقترح جرعات ولا يعدّلها: بيسجّل اللي كتبه المستخدم من الوصفة بس.
//
// القواعد:
//  - الجرعة المجدولة هويتها `YYYY-MM-DD:HH:MM` (وقت الجدول، مش وقت الضغط).
//  - المخزون مش رقم بيتخصم عليه؛ هو مشتق: مخزون_ابتدائي + التعبئات − عدد الجرعات "taken".
//    كده تسجيل "تم" مرتين لنفس الجرعة بيخصم مرة واحدة، والتعبئة على جهاز ما بتضيعش عند الدمج.
//  - كل تغيير فيه طابع زمني (logAt / updatedAt) عشان المزامنة تدمج على مستوى العنصر مش الملف كله.

export type DoseStatus = "taken" | "missed" | "cleared";

export interface StockAdjustment { id: string; qty: number; at: number }

export interface Medication {
  id: string;
  name: string;
  dose: string;
  times: string; // "09:00, 21:00"
  createdAt: number;
  updatedAt: number; // آخر تعديل للحقول الأساسية (الاسم/الجرعة/المواعيد/الحذف)
  deleted?: boolean;
  initialStock: number;
  adjustments: StockAdjustment[];
  log: Record<string, DoseStatus>;
  logAt: Record<string, number>;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function pad(n: number): string { return String(n).padStart(2, "0"); }
export function dateKey(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function doseKey(date: string, time: string): string { return `${date}:${time}`; }

/** يرجّع المواعيد الصالحة مرتبة، أو null لو فيه موعد غلط/مكرر */
export function parseTimes(times: string): string[] | null {
  const parts = times.split(",").map((time) => time.trim());
  if (!parts.length || !parts.every((time) => TIME_RE.test(time)) || new Set(parts).size !== parts.length) return null;
  return [...parts].sort();
}
function safeTimes(times: string): string[] { return parseTimes(times) ?? []; }

export function slotDate(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min);
}

export function takenCount(med: Medication): number {
  let n = 0;
  for (const status of Object.values(med.log)) if (status === "taken") n++;
  return n;
}
export function stockOf(med: Medication): number {
  const adj = med.adjustments.reduce((sum, a) => sum + a.qty, 0);
  return Math.max(0, med.initialStock + adj - takenCount(med));
}
export function dosesPerDay(med: Medication): number { return Math.max(1, safeTimes(med.times).length); }
export function daysLeft(med: Medication): number { return stockOf(med) / dosesPerDay(med); }
/** تنبيه المخزون قبل ما يخلص بأيام (مش بعد ما يخلص) */
export const LOW_STOCK_DAYS = 3;
export function isLowStock(med: Medication): boolean { return daysLeft(med) <= LOW_STOCK_DAYS; }

export function newMedication(input: { id: string; name: string; dose: string; times: string; stock: number }, now: number): Medication {
  return { id: input.id, name: input.name, dose: input.dose, times: input.times, createdAt: now, updatedAt: now, initialStock: input.stock, adjustments: [], log: {}, logAt: {} };
}

/** يقبل الشكل القديم (stock/log فقط) ويحوّله للشكل الجديد من غير ما يغيّر المخزون الظاهر */
export function normalizeMedication(raw: unknown): Medication | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.name !== "string" || typeof r.dose !== "string" || typeof r.times !== "string") return null;
  const log: Record<string, DoseStatus> = {};
  if (r.log && typeof r.log === "object" && !Array.isArray(r.log)) {
    for (const [key, value] of Object.entries(r.log as Record<string, unknown>)) {
      if (value === "taken" || value === "missed" || value === "cleared") log[key] = value;
    }
  }
  const logAt: Record<string, number> = {};
  if (r.logAt && typeof r.logAt === "object" && !Array.isArray(r.logAt)) {
    for (const [key, value] of Object.entries(r.logAt as Record<string, unknown>)) if (key in log && Number.isFinite(value)) logAt[key] = value as number;
  }
  const adjustments: StockAdjustment[] = Array.isArray(r.adjustments)
    ? (r.adjustments as unknown[]).filter((a): a is StockAdjustment => !!a && typeof (a as StockAdjustment).id === "string" && Number.isFinite((a as StockAdjustment).qty) && Number.isFinite((a as StockAdjustment).at))
    : [];
  let initialStock: number;
  if (Number.isFinite(r.initialStock) && (r.initialStock as number) >= 0) initialStock = r.initialStock as number;
  else if (Number.isFinite(r.stock) && (r.stock as number) >= 0) {
    // الشكل القديم: stock كان هو الباقي فعلًا، فنرجّع حساب الابتدائي بحيث المشتق يطلع نفس الرقم
    initialStock = (r.stock as number) + Object.values(log).filter((s) => s === "taken").length;
  } else return null;
  const firstLogDate = Object.keys(log).map((k) => k.slice(0, 10)).sort()[0];
  const createdAt = Number.isFinite(r.createdAt) ? r.createdAt as number : firstLogDate ? slotDate(firstLogDate, "00:00").getTime() : 0;
  return {
    id: r.id, name: r.name, dose: r.dose, times: r.times,
    createdAt, updatedAt: Number.isFinite(r.updatedAt) ? r.updatedAt as number : 0,
    ...(r.deleted === true ? { deleted: true } : {}),
    initialStock, adjustments, log, logAt,
  };
}

/** يسجل حالة جرعة مجدولة (تم/فاتت/إلغاء). الضغط على نفس الحالة تاني بيرجّعها "cleared". */
export function setDoseStatus(med: Medication, key: string, status: DoseStatus, now: number): Medication {
  return { ...med, log: { ...med.log, [key]: status }, logAt: { ...med.logAt, [key]: now } };
}
export function toggleDoseStatus(med: Medication, key: string, status: "taken" | "missed", now: number): Medication {
  return setDoseStatus(med, key, med.log[key] === status ? "cleared" : status, now);
}
export function addStock(med: Medication, qty: number, id: string, now: number): Medication {
  if (!Number.isFinite(qty) || qty === 0) return med;
  return { ...med, adjustments: [...med.adjustments, { id, qty, at: now }] };
}
/** تعديل بيانات الدواء (الاسم/الجرعة/المواعيد). سجل الجرعات والمخزون بيفضلوا زي ما هم. بيرجّع نفس الدواء لو المدخلات مش صالحة. */
export function editMedication(med: Medication, input: { name: string; dose: string; times: string }, now: number): Medication {
  const name = input.name.trim().slice(0, 80);
  const dose = input.dose.trim().slice(0, 100);
  const times = parseTimes(input.times.trim());
  if (!name || !dose || !times) return med;
  return { ...med, name, dose, times: times.join(", "), updatedAt: now };
}
export function removeMedication(med: Medication, now: number): Medication {
  return { ...med, deleted: true, updatedAt: now };
}

export interface ScheduledDose { med: Medication; time: string; key: string; status: DoseStatus | undefined; dueAt: Date }

export function dosesForDay(meds: Medication[], day: Date): ScheduledDose[] {
  const date = dateKey(day);
  const out: ScheduledDose[] = [];
  for (const med of meds) {
    if (med.deleted) continue;
    for (const time of safeTimes(med.times)) {
      const key = doseKey(date, time);
      out.push({ med, time, key, status: med.log[key], dueAt: slotDate(date, time) });
    }
  }
  return out.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.med.name.localeCompare(b.med.name));
}

const isResolved = (status: DoseStatus | undefined) => status === "taken" || status === "missed";

/**
 * التذكيرات المطلوب إطلاقها الآن. `notified` = كام مرة اتنبّه عن كل جرعة (محفوظ في localStorage).
 * تنبيه عند الميعاد وتكرار واحد بعد 15 دقيقة، وبيقف لما تتسجل الجرعة (تم أو فاتت) أو بعد 30 دقيقة.
 */
export const REMINDER_WINDOW_MIN = 30;
export const REMINDER_REPEAT_MIN = 15;
export function pendingReminders(meds: Medication[], now: Date, notified: Record<string, number>): { key: string; med: Medication; time: string; attempt: number }[] {
  const out: { key: string; med: Medication; time: string; attempt: number }[] = [];
  for (const dose of dosesForDay(meds, now)) {
    if (isResolved(dose.status)) continue;
    const lateMin = (now.getTime() - dose.dueAt.getTime()) / 60_000;
    if (lateMin < 0 || lateMin >= REMINDER_WINDOW_MIN) continue;
    const sent = notified[`${dose.med.id}|${dose.key}`] ?? 0;
    const wanted = lateMin >= REMINDER_REPEAT_MIN ? 2 : 1;
    if (sent < wanted) out.push({ key: dose.key, med: dose.med, time: dose.time, attempt: sent + 1 });
  }
  return out;
}

/**
 * التزام كل يوم: الجرعات المجدولة اللي ميعادها عدّى (أو اتسجلت) مقابل اللي اتاخدت.
 * الجرعة اللي ماتسجلتش وعدّى ميعادها بتتحسب فاتت. الجرعات المستقبلية مش بتتحسب.
 */
export function medicationSummary(meds: Medication[], now: Date, days = 30): Record<string, { taken: number; total: number }> {
  const summary: Record<string, { taken: number; total: number }> = {};
  for (let i = 0; i < days; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    for (const dose of dosesForDay(meds, day)) {
      if (dose.dueAt.getTime() < dose.med.createdAt && !dose.status) continue; // قبل ما الدواء يتضاف
      const logged = isResolved(dose.status);
      if (!logged && dose.dueAt.getTime() > now.getTime()) continue;
      const entry = summary[dateKey(day)] ??= { taken: 0, total: 0 };
      entry.total += 1;
      if (dose.status === "taken") entry.taken += 1;
    }
  }
  return summary;
}

// الدمج بين الأجهزة (على مستوى العنصر، مش الملف كله)

const STATUS_RANK: Record<DoseStatus, number> = { cleared: 0, missed: 1, taken: 2 };

function baseFieldsSignature(med: Medication): string {
  return JSON.stringify([med.name, med.dose, med.times, med.initialStock]);
}

/**
 * يدمج نسختين من نفس الدواء:
 *  - الحقول الأساسية (الاسم/الجرعة/المواعيد/المخزون الابتدائي): الأحدث `updatedAt` بيكسب.
 *  - الحذف (tombstone) نهائي: لو أي جهاز حذفه يفضل محذوف.
 *  - التعبئات: اتحاد بالـ id، فتعبئة على جهاز ما بتضيعش.
 *  - سجل الجرعات: لكل جرعة الأحدث `logAt` بيكسب (وده بيسمح بإلغاء "تم" بعد تسجيلها).
 * الدالة تبادلية ومتجانسة (merge(a,b) == merge(b,a)) عشان ترتيب المزامنة ما يفرقش.
 */
export function mergeMedication(a: Medication, b: Medication): Medication {
  const aWins = a.updatedAt !== b.updatedAt ? a.updatedAt > b.updatedAt : baseFieldsSignature(a) >= baseFieldsSignature(b);
  const base = aWins ? a : b;

  const adjustments = new Map<string, StockAdjustment>();
  for (const adj of [...a.adjustments, ...b.adjustments]) if (!adjustments.has(adj.id)) adjustments.set(adj.id, adj);

  const log: Record<string, DoseStatus> = {};
  const logAt: Record<string, number> = {};
  for (const key of new Set([...Object.keys(a.log), ...Object.keys(b.log)])) {
    const sa = a.log[key], sb = b.log[key];
    const ta = a.logAt[key] ?? 0, tb = b.logAt[key] ?? 0;
    let pick: { status: DoseStatus; at: number };
    if (sa === undefined) pick = { status: sb!, at: tb };
    else if (sb === undefined) pick = { status: sa, at: ta };
    else if (ta !== tb) pick = ta > tb ? { status: sa, at: ta } : { status: sb, at: tb };
    else pick = STATUS_RANK[sa] >= STATUS_RANK[sb] ? { status: sa, at: ta } : { status: sb, at: tb };
    log[key] = pick.status;
    logAt[key] = pick.at;
  }

  const created = [a.createdAt, b.createdAt].filter((n) => n > 0);
  return {
    id: a.id, name: base.name, dose: base.dose, times: base.times,
    createdAt: created.length ? Math.min(...created) : 0,
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
    ...(a.deleted || b.deleted ? { deleted: true } : {}),
    initialStock: base.initialStock,
    adjustments: [...adjustments.values()].sort((x, y) => x.at - y.at || x.id.localeCompare(y.id)),
    log, logAt,
  };
}

/** يدمج قائمتين (محلي/سحابة) بعد تطبيعهم. بيحتفظ بالـ tombstones عشان الحذف ينتقل للأجهزة التانية. */
export function mergeMedications(local: unknown, remote: unknown): Medication[] {
  const byId = new Map<string, Medication>();
  for (const raw of [...(Array.isArray(remote) ? remote : []), ...(Array.isArray(local) ? local : [])]) {
    const med = normalizeMedication(raw);
    if (!med) continue;
    const prev = byId.get(med.id);
    byId.set(med.id, prev ? mergeMedication(prev, med) : med);
  }
  return [...byId.values()].sort((x, y) => x.createdAt - y.createdAt || x.id.localeCompare(y.id));
}
