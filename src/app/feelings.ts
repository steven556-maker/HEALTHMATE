/**
 * سجل الإحساس بعد التمرين: 3 أزرار في شاشة الملخص. التخزين محلي فقط (localStorage)، مابيتبعتش لأي حد.
 */
import { t } from "./i18n.ts";

const FEELINGS_KEY = "hm-feelings";
const MAX_KEEP = 90;

export interface FeelingRecord { at: number; exerciseId: string; feeling: "good" | "tired" | "unwell" }

export function readFeelings(): FeelingRecord[] {
  try { const raw = localStorage.getItem(FEELINGS_KEY); const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : []; } catch { return []; }
}

/** سجل الإحساس بعد التمرين: 3 أزرار في شاشة الملخص، التخزين محلي فقط. */
export function renderFeelingPrompt(container: HTMLElement, exerciseId: string): void {
  const wrap = document.createElement("div");
  wrap.id = "feeling-prompt";
  const title = document.createElement("p");
  title.className = "pc-q";
  title.textContent = t("feelingTitle");
  const row = document.createElement("div");
  row.className = "feeling-row";
  const done = document.createElement("p");
  done.className = "hint";
  const options: { v: FeelingRecord["feeling"]; key: Parameters<typeof t>[0] }[] = [
    { v: "good", key: "feelingGood" },
    { v: "tired", key: "feelingTired" },
    { v: "unwell", key: "feelingUnwell" },
  ];
  for (const opt of options) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn pc-opt";
    b.textContent = t(opt.key);
    b.onclick = () => {
      const rows = readFeelings();
      rows.push({ at: Date.now(), exerciseId, feeling: opt.v });
      try { localStorage.setItem(FEELINGS_KEY, JSON.stringify(rows.slice(-MAX_KEEP))); } catch { /* مساحة ممتلئة: مش حرجة */ }
      row.remove();
      done.textContent = opt.v === "unwell" ? `${t("feelingSaved")} ${t("feelingUnwellAdvice")}` : t("feelingSaved");
      wrap.append(done);
    };
    row.append(b);
  }
  wrap.append(title, row);
  container.append(wrap);
}
