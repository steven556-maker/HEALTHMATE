#!/usr/bin/env node
// فحص إعدادات الواجهة قبل/بعد البناء. Vite بيحقن VITE_* وقت البناء بس، فلو القيمة ناقصة وقتها النسخة المنشورة بتفضل
// "Supabase مش مضبوط" / "المساعد معطّل" من غير أي خطأ. السكربت ده بيخلّي النقص ده يوقف الـ build بدل ما يعدّي في صمت.
//
// الاستخدام:
//   node scripts/check-build-env.mjs                      # يقرأ من process.env (زي GitHub Actions)
//   node scripts/check-build-env.mjs --dotenv .env        # يقرأ ملف .env محلي
//   node scripts/check-build-env.mjs --production         # يرفض عنوان مساعد http/localhost
//   node scripts/check-build-env.mjs --dist dist          # بعد البناء: يتأكد إن القيم اتحقنت فعلًا داخل الـ bundle
// السكربت ما بيطبعش قيم الأسرار أبدًا (بيطبع اسم المضيف بس).
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const dotenv = option("--dotenv");
if (dotenv) {
  if (!fs.existsSync(dotenv)) { console.error(`✗ ${dotenv} not found`); process.exit(1); }
  process.loadEnvFile(dotenv);
}

const clean = (value) => (value ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
const errors = [];
const warnings = [];
const urlValue = clean(process.env.VITE_SUPABASE_URL);
const keyValue = clean(process.env.VITE_SUPABASE_ANON_KEY);
const assistantValue = clean(process.env.VITE_ASSISTANT_URL);
const production = flag("--production") || process.env.CI === "true";

function parse(name, raw) {
  try { return new URL(raw); } catch {
    errors.push(`${name} is not a valid absolute URL (starts with ${JSON.stringify(raw.slice(0, 24))}…). Check for a duplicated "NAME=" or stray quotes.`);
    return null;
  }
}

// ---- Supabase URL ----
let supabaseOrigin = "";
if (!urlValue) errors.push("VITE_SUPABASE_URL is empty. Add it as a GitHub Actions secret (or variable) — it is read at BUILD time.");
else if (urlValue.includes("your-project")) errors.push("VITE_SUPABASE_URL still holds the .env.example placeholder.");
else {
  const url = parse("VITE_SUPABASE_URL", urlValue);
  if (url) {
    supabaseOrigin = url.origin;
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) errors.push("VITE_SUPABASE_URL must be https://.");
    if (url.pathname.replace(/\/+$/, "") !== "") warnings.push(`VITE_SUPABASE_URL has a path (${url.pathname}); only the origin is used. Use https://<ref>.supabase.co`);
    if (!url.hostname.endsWith(".supabase.co") && !url.hostname.endsWith(".supabase.in") && !["localhost", "127.0.0.1"].includes(url.hostname)) warnings.push(`VITE_SUPABASE_URL host ${url.hostname} is not *.supabase.co (fine only if it is a custom domain).`);
  }
}

// ---- Supabase key ----
if (!keyValue) errors.push("VITE_SUPABASE_ANON_KEY is empty. Add it as a GitHub Actions secret (or variable) — it is read at BUILD time.");
else if (keyValue.includes("your-supabase")) errors.push("VITE_SUPABASE_ANON_KEY still holds the .env.example placeholder.");
else {
  let role = "";
  try { role = JSON.parse(Buffer.from(keyValue.split(".")[1] ?? "", "base64url").toString("utf8")).role ?? ""; } catch { /* not a JWT */ }
  if (keyValue.startsWith("sb_secret_") || role === "service_role") errors.push("VITE_SUPABASE_ANON_KEY is a service_role/secret key. NEVER ship that to a browser — use the publishable/anon key.");
  else if (!keyValue.startsWith("sb_publishable_") && role !== "anon") warnings.push("VITE_SUPABASE_ANON_KEY does not look like an sb_publishable_… or anon JWT key.");
  if (/\s/.test(keyValue)) errors.push("VITE_SUPABASE_ANON_KEY contains whitespace/newlines (bad copy-paste).");
}

// ---- Assistant URL ----
let assistantOrigin = "";
if (!assistantValue) warnings.push("VITE_ASSISTANT_URL is empty: the AI assistant (and Web Push) will be DISABLED in this build. Set it to the deployed Worker URL.");
else {
  const url = parse("VITE_ASSISTANT_URL", assistantValue);
  if (url) {
    assistantOrigin = url.origin;
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !local) errors.push("VITE_ASSISTANT_URL must be https:// (an https page cannot call an http:// Worker: mixed content is blocked).");
    if (production && local) errors.push("VITE_ASSISTANT_URL points to localhost in a production build.");
  }
}

// ---- بعد البناء: القيم لازم تكون اتحقنت فعلًا ----
const dist = option("--dist");
if (dist) {
  const assets = path.join(dist, "assets");
  const files = fs.existsSync(assets) ? fs.readdirSync(assets).filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(path.join(assets, f), "utf8")) : [];
  if (!files.length) errors.push(`No JS bundles found in ${assets}.`);
  else {
    const bundle = files.join("\n");
    if (supabaseOrigin && !bundle.includes(supabaseOrigin)) errors.push(`The built bundle does not contain ${new URL(supabaseOrigin).host}: VITE_SUPABASE_URL was not inlined (was it set for the build step?).`);
    if (assistantOrigin && !bundle.includes(assistantOrigin)) errors.push(`The built bundle does not contain ${new URL(assistantOrigin).host}: VITE_ASSISTANT_URL was not inlined.`);
  }
}

for (const w of warnings) console.log(`::warning::${w}`);
for (const e of errors) console.log(`::error::${e}`);
if (errors.length) process.exit(1);
console.log(`✓ build config OK — Supabase: ${supabaseOrigin ? new URL(supabaseOrigin).host : "n/a"}, assistant: ${assistantOrigin ? new URL(assistantOrigin).host : "disabled"}${dist ? ", values present in bundle" : ""}`);
