import { SYNC_KEYS } from "../core/merge.ts";
import type { Snapshot } from "../core/merge.ts";

/** لقطة من بيانات الجهاز القابلة للمزامنة/النسخ الاحتياطي */
export function readLocalSnapshot(): Snapshot {
  const snapshot: Snapshot = {};
  for (const key of SYNC_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) snapshot[key] = JSON.parse(raw) as unknown;
    } catch {
      // قيمة محلية تالفة: منرفعهاش ولا نصدّرها
    }
  }
  return snapshot;
}

export function writeLocalSnapshot(snapshot: Snapshot): boolean {
  let ok = true;
  for (const key of SYNC_KEYS) {
    if (!(key in snapshot)) continue;
    try { localStorage.setItem(key, JSON.stringify(snapshot[key])); } catch { ok = false; }
  }
  window.dispatchEvent(new Event("healthmate:refresh"));
  return ok;
}
