// دمج بيانات الجهاز مع بيانات السحابة على مستوى العنصر (مش الملف كله). دوال صافية بدون DOM.
//
// المبادئ:
//  - كل عنصر ليه id وupdatedAt؛ الأحدث بيكسب، والحذف tombstone (deleted: true) نهائي.
//  - ممنوع الاتحاد الأعمى: عنصر اتحذف على جهاز مش بيرجع من جهاز تاني.
//  - الدالة تبادلية: mergeSnapshots(a, b) و mergeSnapshots(b, a) بيدّوا نفس النتيجة.
import type { SessionRecord } from "./coach/rules.ts";
import type { CheckIn } from "./analytics.ts";
import { mergeMedications } from "./medications.ts";

export type Snapshot = Record<string, unknown>;

export interface SessionRow extends SessionRecord { id: string; updatedAt: number; deleted?: boolean }

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** يقبل الشكل القديم (من غير id) ويشتقّ له id ثابت من التمرين ووقته، فكل الأجهزة تطلّع نفس الـ id */
export function normalizeSession(raw: unknown): SessionRow | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.exerciseId !== "string" || !finite(raw.at) || !finite(raw.goodReps) || !finite(raw.badReps)) return null;
  const at = raw.at;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : `legacy:${raw.exerciseId}:${at}`,
    exerciseId: raw.exerciseId,
    goodReps: Math.max(0, raw.goodReps),
    badReps: Math.max(0, raw.badReps),
    holdSeconds: finite(raw.holdSeconds) ? Math.max(0, raw.holdSeconds) : 0,
    ...(raw.pain === true ? { pain: true } : {}),
    at,
    updatedAt: finite(raw.updatedAt) ? raw.updatedAt : at,
    ...(raw.deleted === true ? { deleted: true } : {}),
  };
}

export function mergeSessions(local: unknown, remote: unknown): SessionRow[] {
  const byId = new Map<string, SessionRow>();
  for (const raw of [...(Array.isArray(remote) ? remote : []), ...(Array.isArray(local) ? local : [])]) {
    const row = normalizeSession(raw);
    if (!row) continue;
    const prev = byId.get(row.id);
    if (!prev) { byId.set(row.id, row); continue; }
    const winner = row.updatedAt > prev.updatedAt ? row : prev.updatedAt > row.updatedAt ? prev : (JSON.stringify(row) >= JSON.stringify(prev) ? row : prev);
    byId.set(row.id, { ...winner, ...(prev.deleted || row.deleted ? { deleted: true } : {}) });
  }
  return [...byId.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

export function mergeCheckins(local: unknown, remote: unknown): Record<string, CheckIn> {
  const out: Record<string, CheckIn> = {};
  const l = isRecord(local) ? local : {}, r = isRecord(remote) ? remote : {};
  for (const date of new Set([...Object.keys(l), ...Object.keys(r)])) {
    const a = l[date] as CheckIn | undefined, b = r[date] as CheckIn | undefined;
    if (!isRecord(a)) { if (isRecord(b)) out[date] = b as CheckIn; continue; }
    if (!isRecord(b)) { out[date] = a; continue; }
    const ta = finite(a.updatedAt) ? a.updatedAt : 0, tb = finite(b.updatedAt) ? b.updatedAt : 0;
    out[date] = ta !== tb ? (ta > tb ? a : b) : (JSON.stringify(a) >= JSON.stringify(b) ? a : b);
  }
  return out;
}

/** كائن واحد بـ updatedAt: الأحدث بيكسب كله (للروتين وPAR-Q) */
export function mergeLastWriteWins<T>(local: unknown, remote: unknown): T | undefined {
  const a = isRecord(local) ? local : null, b = isRecord(remote) ? remote : null;
  if (!a) return (b ?? undefined) as T | undefined;
  if (!b) return a as T;
  const ta = finite(a.updatedAt) ? a.updatedAt : 0, tb = finite(b.updatedAt) ? b.updatedAt : 0;
  return (ta !== tb ? (ta > tb ? a : b) : (JSON.stringify(a) >= JSON.stringify(b) ? a : b)) as T;
}

/** الإعدادات اللي بتتزامن بين الأجهزة. الباقي (الكاميرا/الخط/الثيم/الموافقة) خاص بكل جهاز. */
export const SYNCED_SETTINGS = ["level", "muted", "weeklyGoal"] as const;

export function mergeSettings(local: unknown, remote: unknown): Record<string, unknown> | undefined {
  const a = isRecord(local) ? local : null, b = isRecord(remote) ? remote : null;
  if (!a) return b ? { ...b } : undefined;
  if (!b) return a;
  const ta = finite(a.updatedAt) ? a.updatedAt : 0, tb = finite(b.updatedAt) ? b.updatedAt : 0;
  if (tb <= ta) return a;
  const out: Record<string, unknown> = { ...a, updatedAt: tb };
  for (const key of SYNCED_SETTINGS) if (key in b) out[key] = b[key];
  return out;
}

export const SYNC_KEYS = ["hm.sessions", "hm.checkins", "hm.settings", "hm.medications", "hm.routine", "hm.parq"] as const;

export function mergeSnapshots(local: Snapshot, remote: Snapshot): Snapshot {
  const merged: Snapshot = {};
  const sessions = mergeSessions(local["hm.sessions"], remote["hm.sessions"]);
  if ("hm.sessions" in local || "hm.sessions" in remote) merged["hm.sessions"] = sessions;
  if ("hm.checkins" in local || "hm.checkins" in remote) merged["hm.checkins"] = mergeCheckins(local["hm.checkins"], remote["hm.checkins"]);
  const settings = mergeSettings(local["hm.settings"], remote["hm.settings"]);
  if (settings) merged["hm.settings"] = settings;
  for (const key of ["hm.routine", "hm.parq"] as const) {
    const value = mergeLastWriteWins(local[key], remote[key]);
    if (value !== undefined) merged[key] = value;
  }
  if ("hm.medications" in local || "hm.medications" in remote) merged["hm.medications"] = mergeMedications(local["hm.medications"], remote["hm.medications"]);
  return merged;
}

/** JSON بترتيب مفاتيح ثابت (jsonb في Postgres بيعيد ترتيب المفاتيح، فمقارنة النص العادي مش دقيقة) */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
export function sameSnapshot(a: Snapshot, b: Snapshot): boolean { return stableStringify(a) === stableStringify(b); }
