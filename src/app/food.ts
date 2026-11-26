// تسجيل الوجبات: اختيار الأكلة والوزن يدويًا، أو صورة بتتحلل عبر الـ Worker بعد موافقة صريحة.
// السعرات دايمًا تقدير من جدول صغير (worker/src/food.ts). السجل على الجهاز بس (hm.meals): مش بيتزامن ومش في النسخة الاحتياطية.
import { DISHES, dishById, kcalRange, MAX_GRAMS, MIN_GRAMS } from "../../worker/src/food.ts";
import type { Dish } from "../../worker/src/food.ts";
import { allDishes, POPULAR, searchFoods, usdaToDish } from "../core/food-search.ts";
import { assistantUrl as ASSISTANT_URL, hasSupabaseConfig } from "./cloud-config.ts";
import { getLocale } from "./i18n.ts";
import { showToast } from "./ui.ts";

const KEY = "hm.meals";
const CONSENT = "hm.food.photo-consent";
export interface Meal { at: number; dishId: string; grams: number; low: number; high: number; ar?: string; en?: string }

export function readMeals(): Meal[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(v)) return [];
    return v.filter((m): m is Meal => !!m && typeof m.at === "number" && typeof m.dishId === "string" && typeof m.grams === "number" && typeof m.low === "number" && typeof m.high === "number").slice(-300);
  } catch { return []; }
}
function saveMeals(m: Meal[]): void { try { localStorage.setItem(KEY, JSON.stringify(m.slice(-300))); } catch { showToast("!"); } }

/** مجموع نطاق السعرات لوجبات من وقت معيّن. بيرجّع null لو مفيش وجبات (مفيش صفر مصطنع). */
export function totalSince(meals: Meal[], since: number): { low: number; high: number; count: number } | null {
  const rows = meals.filter((m) => m.at >= since);
  if (!rows.length) return null;
  return { low: rows.reduce((n, m) => n + m.low, 0), high: rows.reduce((n, m) => n + m.high, 0), count: rows.length };
}

const S = {
  title: ["وجباتي (تقدير تقريبي)", "My meals (rough estimate)"],
  disclaimer: ["السعرات هنا تقدير تقريبي من جداول منشورة (أكل مصري وعربي وقاعدة USDA العالمية)، ممكن تختلف كتير حسب الوصفة والزيت والحصة. مش بديل لأخصائي تغذية ومش للتشخيص.", "Calories are a rough estimate from published tables (Egyptian and Arabic dishes, plus the USDA international database) and can differ a lot by recipe, oil and portion. Not a substitute for a dietitian and not for diagnosis."],
  dish: ["ابحث عن أكلة (عربي أو إنجليزي)", "Search a food (Arabic or English)"], picked: ["المختار:", "Selected:"], noResults: ["مفيش نتيجة. جرّب كلمة تانية أو الاسم بالإنجليزي.", "No match. Try another word or the English name."], loadingDb: ["جاري تحميل قاعدة الأكل…", "Loading food database…"], usdaNote: ["قاعدة USDA: بالإنجليزي، والقيم لكل 100 جم زي ما هي منشورة.", "USDA database: English names, values per 100 g as published."], g: ["جم", "g"], grams: ["الوزن بالجرام (تقريبي)", "Weight in grams (approx.)"],
  photoConsent: ["أوافق إن الصورة تتبعت لخدمة ذكاء اصطناعي خارجية (Google Gemini) عن طريق خادم التطبيق عشان تتعرف على الأكلة. الصورة بتتصغّر وما بتتخزنش.", "I agree the photo is sent to an external AI service (Google Gemini) through the app server to identify the dish. The photo is resized and not stored."],
  photo: ["صوّر الأكل", "Photo of food"], analyzing: ["جاري التعرف…", "Identifying…"],
  needSignIn: ["التعرف بالصورة محتاج تسجيل دخول. تقدر تختار يدويًا.", "Photo recognition needs sign-in. You can pick manually."],
  unknown: ["ما قدرتش أتعرف على الأكلة. اختارها يدويًا.", "Could not identify the dish. Pick it manually."],
  failed: ["التعرف بالصورة مش متاح دلوقتي. اختار يدويًا.", "Photo recognition is unavailable. Pick manually."],
  limit: ["وصلت للحد اليومي للصور. اختار يدويًا.", "Daily photo limit reached. Pick manually."],
  guess: ["اقتراح من الصورة، راجعه وعدّله:", "Suggestion from photo, review and edit:"],
  estimate: ["تقدير:", "Estimate:"], kcal: ["سعرة", "kcal"], add: ["سجّل الوجبة", "Log meal"],
  today: ["النهارده", "Today"], todayMeals: ["وجبات النهارده", "Today's meals"], week: ["آخر 7 أيام", "Last 7 days"], none: ["لسه مفيش وجبات مسجلة.", "No meals logged yet."],
  invalid: ["راجع الوزن (20 إلى 1200 جرام).", "Check weight (20 to 1200 g)."], clear: ["مسح سجل الوجبات", "Clear meal log"],
  needConsent: ["علّم على الموافقة الأول عشان تستخدم الصورة.", "Tick the consent box first to use a photo."],
  photoTitle: ["أو صوّر الأكل", "Or take a photo"], addTitle: ["سجّل وجبة", "Log a meal"],
  typical: ["حصة معتادة", "typical portion"], range: ["النطاق من مصادر منشورة، وتقدير الوصفات بيتوسّع ±25% (افتراض مننا).", "Range from published sources; recipe estimates widened by 25% (our assumption)."],
} as const;
const en = (): 0 | 1 => (getLocale() === "en" ? 1 : 0);
const tx = (k: keyof typeof S): string => S[k][en()];

// قاعدة USDA (حوالي 3000 صنف) بتتحمّل مرة واحدة لما المستخدم يدوّر، مش مع تحميل التطبيق.
let usdaPool: Dish[] | null = null;
let usdaLoading: Promise<void> | null = null;
function loadUsda(): Promise<void> {
  usdaLoading ??= import("../data/usda-foods.ts").then((m) => { usdaPool = m.USDA_FOODS.map(usdaToDish); }).catch(() => { usdaLoading = null; });
  return usdaLoading;
}

async function shrink(file: File): Promise<{ b64: string; mime: string } | null> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 15 * 1024 * 1024) return null;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return null;
  const scale = Math.min(1, 768 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height); // إعادة الرسم بتشيل بيانات EXIF (زي الموقع)
  const url = c.toDataURL("image/jpeg", 0.8);
  const b64 = url.slice(url.indexOf(",") + 1);
  return b64.length < 1_400_000 ? { b64, mime: "image/jpeg" } : null;
}

async function token(): Promise<string | null> {
  if (!hasSupabaseConfig) return null;
  const { getAccessToken } = await import("./cloud-sync.ts");
  return getAccessToken();
}

async function recognize(file: File): Promise<{ dish: string; grams: number } | "signin" | "limit" | "failed"> {
  const tk = await token();
  if (!tk || !ASSISTANT_URL) return "signin";
  const img = await shrink(file);
  if (!img) return "failed";
  const base = ASSISTANT_URL.replace(/\/$/, "").replace(/\/api\/chat$/, "");
  try {
    const res = await fetch(`${base}/api/food`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` }, body: JSON.stringify({ image: img.b64, mime: img.mime }), signal: AbortSignal.timeout(30_000) });
    if (res.status === 429) return "limit";
    if (!res.ok) return "failed";
    const data = await res.json() as { dish?: unknown; grams?: unknown };
    return typeof data.dish === "string" && typeof data.grams === "number" ? { dish: data.dish, grams: data.grams } : "failed";
  } catch { return "failed"; }
}

export function renderFoodCard(): void {
  let card = document.getElementById("food-card");
  if (!card) {
    const host = document.getElementById("tab-food");
    if (!host) return;
    card = document.createElement("section"); card.id = "food-card"; card.className = "panel food-card"; host.append(card);
  }
  const root = card; root.replaceChildren();
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  root.append(el("h2", "", tx("title")), el("p", "hint", tx("disclaimer")));

  const msg = el("p", "hint"); msg.setAttribute("role", "status");
  const search = el("input", "select-field"); search.type = "search"; search.setAttribute("autocomplete", "off"); search.setAttribute("enterkeyhint", "search");
  const results = el("ul", "food-results"); results.setAttribute("role", "listbox");
  let picked: Dish | undefined = DISHES[0];
  const name = (d: Dish): string => (en() ? d.en : d.ar);
  const pickedLine = el("p", "food-picked");
  const gramsIn = el("input"); gramsIn.type = "number"; gramsIn.min = String(MIN_GRAMS); gramsIn.max = String(MAX_GRAMS); gramsIn.inputMode = "numeric";
  const preview = el("p", "food-preview");
  const update = (): void => {
    const d = picked;
    pickedLine.textContent = d ? `${tx("picked")} ${name(d)} (${d.typicalG} ${tx("g")})` : "";
    if (d && !gramsIn.value) gramsIn.placeholder = `${d.typicalG}`;
    const g = Number(gramsIn.value || d?.typicalG);
    const e = d ? kcalRange(d, g) : null;
    preview.textContent = e ? `${tx("estimate")} ${e.low === e.high ? e.low : `${e.low} - ${e.high}`} ${tx("kcal")}` : "";
  };
  const choose = (d: Dish): void => { picked = d; gramsIn.value = ""; update(); };
  const renderResults = (): void => {
    results.replaceChildren();
    const q = search.value.trim();
    const list = q ? searchFoods(q, allDishes(usdaPool ?? []), 12) : POPULAR;
    if (q && !list.length) { const li = el("li", "hint", usdaPool ? tx("noResults") : tx("loadingDb")); results.append(li); return; }
    for (const d of list) {
      const li = el("li"); const b = el("button", "food-result", name(d)); b.type = "button"; b.setAttribute("role", "option");
      b.onclick = () => { choose(d); results.replaceChildren(); search.value = name(d); }; // الاسم يفضل ظاهر في خانة البحث
      li.append(b); results.append(li);
    }
    if (q && list.some((d) => d.usda)) results.append(el("li", "hint", tx("usdaNote")));
  };
  search.oninput = () => { renderResults(); if (!usdaPool) void loadUsda().then(renderResults); };
  search.onfocus = () => { void loadUsda(); search.select(); }; // تحديد النص عشان البحث الجديد يمسحه
  renderResults(); // أشهر الأكلات تظهر من الأول
  gramsIn.oninput = update;

  const f1 = el("label", "field"); f1.append(el("span", "", tx("dish")), search);
  const f2 = el("label", "field"); f2.append(el("span", "", tx("grams")), gramsIn);

  // الصورة: موافقة منفصلة وصريحة
  const consentWrap = el("label", "cloud-consent"); const cb = el("input"); cb.type = "checkbox";
  try { cb.checked = localStorage.getItem(CONSENT) === "1"; } catch { /* تجاهل */ }
  cb.onchange = () => { try { if (cb.checked) localStorage.setItem(CONSENT, "1"); else localStorage.removeItem(CONSENT); } catch { /* تجاهل */ } };
  consentWrap.append(cb, el("span", "", tx("photoConsent")));
  const file = el("input"); file.type = "file"; file.accept = "image/jpeg,image/png,image/webp"; file.setAttribute("capture", "environment"); file.hidden = true;
  const photoBtn = el("button", "btn", tx("photo")); photoBtn.type = "button";
  photoBtn.onclick = () => { if (!cb.checked) { cb.focus(); msg.textContent = tx("needConsent"); return; } file.click(); };
  file.onchange = async () => {
    const f = file.files?.[0]; file.value = ""; if (!f) return;
    photoBtn.disabled = true; msg.textContent = tx("analyzing");
    const r = await recognize(f);
    photoBtn.disabled = false;
    if (r === "signin") msg.textContent = tx("needSignIn");
    else if (r === "limit") msg.textContent = tx("limit");
    else if (r === "failed") msg.textContent = tx("failed");
    else if (r.dish === "unknown" || !dishById(r.dish)) msg.textContent = tx("unknown");
    else { picked = dishById(r.dish); update(); gramsIn.value = String(r.grams); msg.textContent = tx("guess"); update(); }
  };

  const add = el("button", "btn primary", tx("add")); add.type = "button";
  add.onclick = () => {
    const d = picked; const g = Number(gramsIn.value || d?.typicalG);
    const e = d ? kcalRange(d, g) : null;
    if (!d || !e) { msg.textContent = tx("invalid"); return; }
    saveMeals([...readMeals(), { at: Date.now(), dishId: d.id, grams: Math.round(g), low: e.low, high: e.high, ar: d.ar, en: d.en }]);
    gramsIn.value = ""; msg.textContent = ""; renderFoodCard();
  };

  const meals = readMeals(); const now = Date.now();
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const totals = el("div", "food-totals");
  const fmt = (t: { low: number; high: number } | null): string => (t ? (t.low === t.high ? `${t.low}` : `${t.low} - ${t.high}`) + ` ${tx("kcal")}` : "-");
  totals.append(el("p", "", `${tx("today")}: ${fmt(totalSince(meals, startOfDay.getTime()))}`), el("p", "", `${tx("week")}: ${fmt(totalSince(meals, now - 7 * 86400000))}`));
  if (!meals.length) totals.append(el("p", "hint", tx("none")));
  const todays = meals.filter((m) => m.at >= startOfDay.getTime()).reverse();
  const mealName = (m: Meal): string => (en() ? m.en ?? m.ar : m.ar ?? m.en) ?? (dishById(m.dishId) ? name(dishById(m.dishId)!) : "-");
  const mealList = el("ul", "food-meals");
  for (const m of todays) mealList.append(el("li", "", `${mealName(m)} - ${m.grams} ${tx("g")} - ${m.low === m.high ? m.low : `${m.low} - ${m.high}`} ${tx("kcal")}`));

  const group = (cls: string, ...nodes: HTMLElement[]): HTMLElement => { const g = el("div", cls); g.append(...nodes); return g; };
  const addBox = group("food-group", el("h3", "", tx("addTitle")), f1, results, pickedLine, f2, preview, el("p", "hint", tx("range")), add);
  const photoBox = group("food-group", el("h3", "", tx("photoTitle")), consentWrap, photoBtn, file, msg);
  root.append(totals);
  if (todays.length) root.append(el("h3", "", tx("todayMeals")), mealList);
  root.append(addBox, photoBox);
  if (meals.length) {
    const clr = el("button", "btn danger", tx("clear")); clr.type = "button";
    clr.onclick = () => { try { localStorage.removeItem(KEY); } catch { /* تجاهل */ } renderFoodCard(); };
    root.append(clr);
  }
  update();
}

window.addEventListener("healthmate:locale", () => { const host = document.getElementById("tab-food"); if (host && !host.hidden) renderFoodCard(); });
