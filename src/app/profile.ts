// ملف شخصي بسيط (اسم/سن/طول). بيتخزن على الجهاز بس: مش بيتزامن، مش في النسخة الاحتياطية، ومش بيتبعت للمساعد.
// "مسح كل البيانات" بيمسحه (hm.profile في ALL_LOCAL_KEYS).
import { getLocale } from "./i18n.ts";

export interface Profile { name: string; age?: number; heightCm?: number }
const KEY = "hm.profile";

export function parseProfile(raw: unknown): Profile {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const name = typeof r.name === "string" ? r.name.trim().slice(0, 40) : "";
  const num = (v: unknown, min: number, max: number): number | undefined =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : undefined;
  const age = num(r.age, 5, 110), heightCm = num(r.heightCm, 80, 230);
  return { name, ...(age !== undefined ? { age } : {}), ...(heightCm !== undefined ? { heightCm } : {}) };
}
export function getProfile(): Profile {
  try { return parseProfile(JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { return { name: "" }; }
}
function saveProfile(p: Profile): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(p)); return true; } catch { return false; }
}

const S = {
  title: ["بياناتي", "My details"], name: ["الاسم (اختياري)", "Name (optional)"], age: ["السن (اختياري)", "Age (optional)"],
  height: ["الطول بالسم (اختياري)", "Height in cm (optional)"], save: ["حفظ بياناتي", "Save my details"], saved: ["اتحفظ على جهازك.", "Saved on this device."],
  invalid: ["راجع السن (5 إلى 110) والطول (80 إلى 230).", "Check age (5 to 110) and height (80 to 230)."],
  privacy: ["البيانات دي على جهازك بس، مش بتتزامن ومش بتتبعت لأي حد.", "These stay on this device only. They are not synced or sent anywhere."],
} as const;
const tx = (k: keyof typeof S): string => S[k][getLocale() === "en" ? 1 : 0];

export function initProfile(): void {
  const sheet = document.querySelector<HTMLElement>("#settings .settings-sheet");
  if (!sheet) return;
  const box = document.createElement("section"); box.className = "profile-box";
  const render = (): void => {
    box.replaceChildren();
    const p = getProfile();
    const h = document.createElement("h3"); h.textContent = tx("title"); box.append(h);
    const field = (label: string, value: string, type: string, inputMode: string): HTMLInputElement => {
      const wrap = document.createElement("label"); wrap.className = "field";
      const span = document.createElement("span"); span.textContent = label;
      const input = document.createElement("input"); input.type = type; input.value = value; input.inputMode = inputMode as "text";
      if (type === "text") input.maxLength = 40;
      wrap.append(span, input); box.append(wrap); return input;
    };
    const nameIn = field(tx("name"), p.name, "text", "text");
    const ageIn = field(tx("age"), p.age?.toString() ?? "", "number", "numeric");
    const hIn = field(tx("height"), p.heightCm?.toString() ?? "", "number", "numeric");
    const msg = document.createElement("p"); msg.className = "hint"; msg.setAttribute("role", "status");
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "btn primary"; btn.textContent = tx("save");
    btn.onclick = () => {
      const toNum = (s: string): number | undefined => (s.trim() === "" ? undefined : Number(s));
      const a = toNum(ageIn.value), hh = toNum(hIn.value);
      const next = parseProfile({ name: nameIn.value, age: a, heightCm: hh });
      if ((a !== undefined && next.age === undefined) || (hh !== undefined && next.heightCm === undefined)) { msg.textContent = tx("invalid"); return; }
      msg.textContent = saveProfile(next) ? tx("saved") : "";
      window.dispatchEvent(new Event("healthmate:profile"));
    };
    const priv = document.createElement("p"); priv.className = "hint"; priv.textContent = tx("privacy");
    box.append(btn, msg, priv);
  };
  render();
  window.addEventListener("healthmate:locale", render);
  sheet.querySelector("h2")?.after(box);
}
