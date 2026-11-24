// نسخة احتياطية يدوية (ملف JSON) من بيانات المستخدم. دوال صافية.
// الاستيراد بيدمج (مش بيستبدل) بنفس قواعد المزامنة، فمفيش بيانات بتضيع ولا حذف بيرجع.
import { SYNC_KEYS } from "./merge.ts";
import type { Snapshot } from "./merge.ts";

export const BACKUP_APP = "healthmate";
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

export interface Backup { app: typeof BACKUP_APP; version: number; exportedAt: string; data: Snapshot }

export function buildBackup(snapshot: Snapshot, now: Date): Backup {
  const data: Snapshot = {};
  for (const key of SYNC_KEYS) if (key in snapshot) data[key] = snapshot[key];
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), data };
}

export type ParseResult = { ok: true; data: Snapshot } | { ok: false; reason: "too_large" | "invalid" | "wrong_app" | "newer_version" };

/** بيقبل مفاتيح معروفة بس، وأي حاجة تانية في الملف بتتتجاهل */
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, reason: "too_large" };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, reason: "invalid" }; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "invalid" };
  const file = raw as Partial<Backup>;
  if (file.app !== BACKUP_APP) return { ok: false, reason: "wrong_app" };
  if (typeof file.version !== "number" || file.version > BACKUP_VERSION) return { ok: false, reason: "newer_version" };
  if (!file.data || typeof file.data !== "object" || Array.isArray(file.data)) return { ok: false, reason: "invalid" };
  const data: Snapshot = {};
  for (const key of SYNC_KEYS) if (key in file.data) data[key] = (file.data as Snapshot)[key];
  return { ok: true, data };
}
