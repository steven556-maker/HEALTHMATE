import { buildBackup, parseBackup } from "../core/backup.ts";
import { mergeSnapshots } from "../core/merge.ts";
import { toDateKey } from "../core/analytics.ts";
import { readLocalSnapshot, writeLocalSnapshot } from "./local-snapshot.ts";
import { notifyLocalDataChanged } from "./cloud-events.ts";
import { t } from "./i18n.ts";
import { $, showToast } from "./ui.ts";

// نسخة احتياطية يدوية: تصدير ملف JSON واستيراده (دمج مش استبدال). بتحمي من مسح بيانات المتصفح من غير حساب سحابي.
export function exportBackup(): void {
  const now = new Date();
  const json = JSON.stringify(buildBackup(readLocalSnapshot(), now), null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `healthmate-backup-${toDateKey(now)}.json`;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  showToast(t("backupExported"), 6000);
}

async function importBackup(file: File): Promise<void> {
  const result = parseBackup(await file.text());
  if (!result.ok) { showToast(t(result.reason === "too_large" ? "backupTooLarge" : result.reason === "wrong_app" ? "backupWrongApp" : result.reason === "newer_version" ? "backupNewer" : "backupInvalid"), 6000); return; }
  const ok = writeLocalSnapshot(mergeSnapshots(readLocalSnapshot(), result.data));
  notifyLocalDataChanged();
  showToast(t(ok ? "backupImported" : "storageUnavailable"), 6000);
}

export function initBackup(): void {
  const input = $<HTMLInputElement>("backup-file");
  $("btn-export-backup").onclick = exportBackup;
  $("btn-import-backup").onclick = () => input.click();
  input.onchange = () => { const file = input.files?.[0]; input.value = ""; if (file) void importBackup(file); };
}
