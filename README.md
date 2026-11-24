# HEALTHMATE

HEALTHMATE تطبيق ويب ثنائي اللغة (عربي RTL / إنجليزي LTR) لمتابعة تمارين منزلية باستخدام كاميرا الهاتف. تحليل الحركة محلي في المتصفح، وتبقى السجلات على الجهاز افتراضيًا؛ يمكن مزامنتها مع حساب Supabase بعد تفعيله وموافقة المستخدم.

## Submission overview (English)

**HEALTHMATE** is a bilingual (Arabic RTL / English LTR) installable web app (PWA) for home exercise. It gives real-time **form and rep guidance** from the phone camera, spoken coaching cues, local progress tracking, and an optional account with opt-in cloud sync and an optional AI assistant.

### What it does

- **7 camera-tracked exercises:** Squat, Push-up, Plank, Lunge, Glute bridge, Wall sit and Sit-to-stand (30 s chair-stand test). Each has a rep counter or hold timer plus form checks that produce plain-language corrections.
- **Audio coaching:** 20 bundled recorded Arabic cues (MP3) and on-device `speechSynthesis` (English cues, and the fallback when an MP3 fails). Both go through one serial queue, so cues never overlap; a new cue can interrupt the current one; one global mute silences everything (`src/app/audio-coordinator.ts`, `src/app/voice.ts`).
- **Progress and coaching:** weekly progress, sleep/stress/mood check-ins, a rules-based coach that always shows the reason for a suggestion, and a local medication organiser (it never suggests doses).
- **Bilingual UI:** `src/locales/ar.json` and `en.json` (identical key sets, enforced by a test); `<html lang dir>` switches between `rtl` and `ltr`.
- **Optional AI assistant:** Cloudflare Worker -> every free Gemini model in turn (instant failover on quota errors, exhausted models skipped for a short time) -> Groq -> static FAQ fallback (including an urgent-care message for serious symptoms). Transient failures are retried in up to 3 rounds across the model chain, the UI retries silently up to 3 times, and the last resort is a matching built-in reply, so users never see an error or a "fallback" label. The reply is always HTTP 200. Requires sign-in; per-IP and per-user daily limits.
- **Optional account + sync:** Supabase Auth and one Postgres table protected by Row Level Security; explicit consent required before anything is uploaded.

### Architecture

```
Browser (Vite + TypeScript, small React islands, PWA / service worker)
 |- MediaPipe Pose Landmarker (self-hosted under /vendor) -> src/core: angles, rep counter, form rules
 |- localStorage  (default, local-first store)
 |- Supabase (optional)  Auth + public.healthmate_user_data (RLS, anon revoked)
 '- Cloudflare Worker (optional)  POST /api/chat, GET /api/health, /push/*
      |- verifies the user's Supabase token (/auth/v1/user), KV daily quota + rate-limit binding
      '- Gemini (OpenAI-compatible endpoint) -> Groq -> static fallback
Hosting: GitHub Pages at /HEALTHMATE/ via .github/workflows/deploy.yml
```

### Privacy (local-first, opt-in sync)

- Pose analysis runs in the browser. **Camera frames and video are never uploaded or stored.**
- Records stay in `localStorage` by default. Nothing is sent to Supabase unless the user signs in **and** consents to sync. Assistant chat history and camera data are excluded from sync. Sign-out does not delete cloud data; the in-app "delete my account and data" button does.
- The assistant sends only the recent chat messages, plus (only with a separate consent switch) a small numeric summary: sessions in the last 7 days and today's sleep/stress/mood. Body weight is never sent. Provider API keys exist only as Worker secrets.
- Third-party requests the app can make: Supabase (if configured), the assistant Worker (if configured), Google Fonts (Cairo/Inter), and, only if the self-hosted MediaPipe files are missing, a CDN fallback for the MediaPipe code/model.
- Not a medical device: no diagnosis and no medication advice.

### Quick verification (about 5 minutes, no accounts needed)

```sh
npm ci
npm run typecheck && npm run lint && npm test   # static checks + unit/integration tests
npm run build                                   # -> dist/, base path /HEALTHMATE/
npm run preview                                 # http://localhost:4173/HEALTHMATE/
```

Camera access needs `localhost` or HTTPS. Without any `.env` the app runs fully local (sign-in and assistant show "not configured"). `npm run check:env` validates `.env` before a cloud-enabled build. Browser end-to-end tests (`npm run test:e2e`, after `npx playwright install chromium`) default to the deployed site; set `HEALTHMATE_BASE_URL` to test another URL.

### Deploying it (GitHub Pages + optional Cloudflare Worker + Supabase)

The exact one-time secrets, variables and dashboard steps are in **[docs/verify-cloud-and-assistant.md](docs/verify-cloud-and-assistant.md)** (section 0), together with smoke tests for each piece. The repository slug must be `HEALTHMATE` (the build base path is `/HEALTHMATE/`).

### Known limitations

- Web Push medication reminders are implemented in the Worker but are optional and **off in the default GitHub Pages build** (they need VAPID keys; see "Web Push" below).
- The Google sign-in button is hidden unless the build sets `VITE_GOOGLE_AUTH=true`; `deploy.yml` does not set it, so the deployed app uses email + password.
- Recorded voice cues are Arabic only. English (and Arabic when no MP3 is available) uses the device's speech voice, and some devices have no Arabic voice, in which case the cue is shown as text.
- Pose accuracy has not been clinically validated; side-on filming is recommended.

---

## التشغيل محليًا

```sh
npm ci
npm run dev
```

يضبط Vite مسار النشر على `/HEALTHMATE/` لمستودع GitHub Pages. ينشر ملف `.github/workflows/deploy.yml` نسخة `dist/` تلقائيًا عند التحديث على فرع `main`.

لإنشاء نسخة النشر شغّل `npm run build`. يمكن معاينة `dist/` باستخدام `npm run preview`. الكاميرا تحتاج `localhost` أو HTTPS.

## المميزات

- رسوم توضيحية لكل تمرين، ومكتبة لتشغيل 20 تسجيلًا صوتيًا مرفقًا.
- تمارين منزلية مع قياس الوضعية والتنبيهات الصوتية.
- منظم أدوية محلي مع متابعة المخزون والالتزام.
- تقدم أسبوعي ومدرب قواعد يوضح سبب كل اقتراح.
- مساعد اختياري يعمل عبر Cloudflare Worker: Gemini أولًا، ثم Groq، ثم ردود احتياطية ثابتة. مفاتيح المزوّد محفوظة سرًا في الخادم.
- واجهة عربية وإنجليزية مع اتجاه RTL/LTR، ودعم PWA.
- دخول وإنشاء حساب اختياريان، مع مزامنة سجلات محمية بسياسات RLS.

## تنظيم الملفات

- `src/core/`: حساب الزوايا، تعريفات التمارين، العدّ، وقواعد المدرب.
- `src/app/`: وحدات الواجهة والتخزين والصوت.
- `src/components/ui/`: مكوّنات React للمخطط ولوحة التقدم الصحية.
- `src/locales/` و`src/app/i18n.ts`: قاموسا العربية والإنجليزية ومنطق تبديل اللغة.
- `web/styles/`: نظام التصميم. `tokens.css` فيه كل الألوان والمسافات (فاتح وداكن بتعريف واحد عبر `light-dark()`)، و`base.css` للأساسيات، و`components.css` و`screens.css` و`account.css` و`print.css` للمكوّنات والشاشات.
- `worker/`: وسيط المساعد الاختياري.

الواجهة الأساسية ما زالت Vanilla TypeScript. أضفنا React كجزر مستقلة للمخطط والتنقل ولوحة التقدم حتى تظل معالجة الكاميرا الحالية مستقرة. إعداد React وTailwind موجود في Vite، ومجلد `src/components/ui/` هو مكان مكوّنات العرض المشتركة على نمط shadcn.

لوحة التقدم تستخدم جلسات المستخدم وإدخالات النوم والالتزام المسجل بالأدوية، وتعرض التكرارات ودقة الوضعية والنوم وأرقام الالتزام.

## تشغيل المساعد

المساعد يستخدم Gemini عبر سلسلة `GEMINI_MODELS` (الافتراضي: كل موديلات Gemini المجانية، من الأقوى للأخف؛ الحصص المجانية تتغير من Google بدون إعلان، وأي موديل غير متاح يتخطاه الكود تلقائيًا)، ثم Groq عند ضبط `GROQ_API_KEY`، ثم الردود الثابتة. اضبط `GEMINI_API_KEY` كسر في Cloudflare Worker (و`GROQ_API_KEY` اختياري)، ثم مرر عنوان الـ Worker في `VITE_ASSISTANT_URL` وقت بناء الواجهة. لا تضع مفاتيح المزوّد في ملفات الواجهة أو متغيرات `VITE_`.

## إعداد قاعدة البيانات (Supabase)

تعمل البيانات محليًا افتراضيًا. لتفعيل الحسابات والمزامنة:

1. أنشئ مشروعًا مجانيًا في Supabase، ثم افتح **SQL Editor** وشغّل `supabase/schema.sql`.
2. انسخ `.env.example` إلى `.env`، ثم ضع **Project URL** ومفتاح **publishable/anon** من إعدادات المشروع في `VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY`.
3. أعد تشغيل `npm run dev`. افتح الإعدادات، أنشئ حسابًا بالبريد وكلمة مرور، وأكّد البريد إذا طلب Supabase ذلك.
4. زر الحساب في الشريط العلوي يفتح تسجيل الدخول أو إنشاء الحساب. أكّد بريدك إذا طُلب ذلك، ثم وافق على المزامنة واضغط «مزامنة بياناتي». ستُدمج السجلات المحلية مع سجلات الحساب؛ في السجلات المتعارضة تكون بيانات يوم المتابعة المحلية هي الأحدث، ويُستخدم أقل رصيد دواء لتجنب إظهار كمية أعلى من الحقيقية.

لتفعيل Google، أضف Google من **Authentication → Sign In / Providers** في Supabase واضبط رابط إعادة التوجيه إلى عنوان الموقع. روابط تأكيد البريد واستعادة كلمة المرور تحتاج إعداد URL الموقع ومزوّد البريد في إعدادات Auth. **مهم:** من **Authentication → URL Configuration** اضبط Site URL على `https://<user>.github.io/HEALTHMATE/` (بدل localhost الافتراضي) وأضف في Redirect URLs النمطين `https://<user>.github.io/HEALTHMATE/**` و`http://localhost:5173/HEALTHMATE/**`. للتحقق من الإعداد قبل النشر: `npm run check:env`. خطوات التحقق الكاملة: `docs/verify-cloud-and-assistant.md`. نموذج تسجيل الدخول يعمل بالبريد وكلمة المرور دون إعداد Google.

لا تضع مفتاح `service_role` في الواجهة أو ملف `.env` الخاص بـ Vite. المفتاح العام مناسب للواجهة لأن سياسات RLS في `schema.sql` تقصر كل صف على صاحبه. لا تُرفع بيانات الصحة قبل تسجيل الدخول والموافقة على المزامنة. صور الكاميرا والفيديو وسجل محادثة المساعد مستثناة من المزامنة. تسجيل الخروج لا يحذف البيانات من الجهاز ولا من قاعدة Supabase، ويطلب تأكيدًا قبل التنفيذ، وزر «شوف تقدّمي» يغلق النافذة ويفتح تبويب التقدّم. الموافقة على المزامنة تُحفظ لكل حساب، فعند تسجيل الدخول مرة أخرى بنفس الحساب تعود المزامنة تلقائيًا. إن كان الجهاز مربوطًا بحساب مختلف (مثلًا Google بدل الإيميل) تظهر للمستخدم خياران: تحميل بيانات الحساب الحالي من السحابة، أو دمج بيانات الجهاز فيه.

التطبيق للتوعية والمتابعة فقط، وليس بديلًا للطبيب أو العلاج الطبيعي. لا يقدم توصيات جرعات أو تعديل أدوية.


## بنية المشروع ومصدر الحقيقة

- **`src/`** (TypeScript) هو المصدر الوحيد. `vite build` بيطلّع `dist/`، و`tsc` للفحص فقط (`noEmit`). مفيش `web/js` ولا `web/index.html` ولا `sw.js` يدوي: الـ service worker بيتولّد من `vite-plugin-pwa` وبيحمّل `web/notify-sw.js` (نقر الإشعار + استقبال push).
- **الترجمة**: `src/locales/ar.json` و`en.json` فقط، وفي اختبار بيتأكد إن المفاتيح متطابقة.
- **MediaPipe offline**: `npm run vendor` (بيتشغّل تلقائيًا قبل dev/build) بينسخ ملفات wasm للمجلد `web/vendor` وينزّل الموديل. لو فشل، التطبيق بيرجع للـ CDN بنفس الإصدار (0.10.14).

## أوامر

```
npm install
npm run typecheck   # tsc --noEmit
npm test            # اختبارات النواة والمزامنة والأدوية وWorker والواجهة
npm run build
```

## Supabase

شغّل `supabase/schema.sql` كاملًا في SQL Editor (آمن لإعادة التشغيل). بيضيف عمود `version` للتحكم في تعارض الأجهزة ودالة `delete_my_account()` لزرار "احذف حسابي وبياناتي". الدمج بين الأجهزة على مستوى العنصر (id + updatedAt + tombstone) في `src/core/merge.ts`.

## الـ Worker (المساعد)

```
cp worker/.dev.vars.example worker/.dev.vars
# أضف GEMINI_API_KEY في worker/.dev.vars، و GROQ_API_KEY اختياري
npm run dev:worker
# في نافذة أخرى: npm run dev
```

أضف مفاتيح الإنتاج باستخدام `npx wrangler secret put GEMINI_API_KEY --config worker/wrangler.toml` و(اختياريًا) `npx wrangler secret put GROQ_API_KEY --config worker/wrangler.toml`، ثم `npx wrangler deploy --config worker/wrangler.toml` (يُشغَّل من جذر المستودع؛ ملف الإعداد داخل `worker/`). المزوّد الأساسي Gemini يجرب `GEMINI_MODELS` بالتتابع، ثم Groq، ثم ردود `worker/src/fallback.js`. عند خطأ 429 (الحصة خلصت) أو 404 ينتقل الـ Worker فورًا للموديل التالي من غير انتظار (لكل موديل حصة مجانية مستقلة)، ويتذكّر الموديلات المستنفدة في ذاكرته لفترة قصيرة (من 5 ثوانٍ حتى 30 دقيقة حسب نوع الحد) فيتخطاها في الطلبات التالية بلا اتصال. أخطاء الخادم المؤقتة (5xx أو timeout أو شبكة) تُعاد مرة على نفس الموديل بانتظار أقل من 0.3 ثانية، ثم يرجع الـ Worker لهذه الموديلات في جولة ثانية وثالثة (بوقفة قصيرة) قبل أن ينتقل إلى Groq أو الرد الثابت. موديلات 429/400/404 لا تُعاد لأن إعادتها بلا فائدة. مهلة 10 ثوانٍ لكل طلب وميزانية كلية 25 ثانية (أقل من مهلة الواجهة 35 ثانية). لو خلصت كل الموديلات (وGroq غير مضبوط) يرجع رد ثابت بحالة 200 وليس خطأ، والواجهة نفسها تعيد محاولة انقطاع الشبكة 3 مرات سريعة قبل أي رسالة. لا يكتب الـ Worker على KV لتذكّر الموديل الناجح، توفيرًا لحد الكتابة اليومي في الخطة المجانية. آخر موديل Gemini ناجح يُحفظ في KV عشر دقائق. مسار الدردشة `POST /api/chat`؛ يتطلب تسجيل الدخول، ويقبل آخر 20 رسالة حتى 2000 حرف لكل رسالة، مع حد 10 طلبات/دقيقة لكل عنوان IP من Cloudflare Rate Limiting، إضافة إلى حد يومي لكل مستخدم. الواجهة لا تُظهر أي رسالة فشل ولا وسم «رد تلقائي»: تعيد المحاولة بصمت حتى 3 مرات، وإن فشلت كلها تعرض ردًا ثابتًا مناسبًا للسؤال من `worker/src/fallback.js` (نفس الملف تستخدمه الواجهة بدون اتصال). الاستثناءان الوحيدان: «سجّل الدخول» و«وصلت للحد اليومي». مفاتيح المزوّد في Worker فقط؛ لا تضعها في متغيرات `VITE_`.

في نشر GitHub Pages أضف GitHub Actions secrets باسم `VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY`، وGitHub Actions variable باسم `VITE_ASSISTANT_URL` (عنوان Worker المنشور). لا تُضمّن قيمًا حقيقية في ملفات المصدر.

لنشر Worker تلقائيًا مع GitHub Actions، أنشئ Cloudflare KV namespace باسم `RATE_KV` وخزّن معرّفه في Actions variable باسم `RATE_KV_NAMESPACE_ID`. أضف secrets `CLOUDFLARE_API_TOKEN` (صلاحية Workers Scripts وKV)، `GEMINI_API_KEY`، `VITE_SUPABASE_URL`، `VITE_SUPABASE_ANON_KEY`، و`GROQ_API_KEY` اختياريًا، وأضف variable `CLOUDFLARE_ACCOUNT_ID`. فعّل النشر بإضافة Actions variable `DEPLOY_WORKER=true`. سير العمل يحقن معرّف KV وقت النشر فقط ولا يكتبه إلى المستودع. بعد أول نشر حدّث Actions variable `VITE_ASSISTANT_URL` إلى عنوان Worker، ثم أعد تشغيل بناء Pages حتى تتصل الواجهة به. بديلًا عن CI: أنشئ KV باستخدام `npx wrangler kv namespace create RATE_KV`، ضع المعرّف في `worker/wrangler.toml` بدل `__RATE_KV_NAMESPACE_ID__`، ثم اضبط `GEMINI_API_KEY` و`SUPABASE_URL` و`SUPABASE_ANON_KEY` و`GROQ_API_KEY` الاختياري بأوامر `npx wrangler secret put ... --config worker/wrangler.toml` بعد `npx wrangler deploy --config worker/wrangler.toml`.

تشغيل Pages وحده لا ينشر Worker. يلزم حساب Cloudflare وصلاحية API token ومعرّف KV حقيقي. لتعديل الإجابات المؤقتة عدّل الأسئلة والكلمات في `worker/src/fallback.js`.

## قيود معروفة

- تذكير الأدوية والتطبيق مقفول يعتمد على Web Push: الـ Worker (cron + `/push/*`) والـ service worker جاهزين، لكنه اختياري ومعطّل افتراضيًا في نشر GitHub Pages لأنه يحتاج مفاتيح VAPID (`VAPID_PUBLIC_KEY` في `wrangler.toml` و`VAPID_PRIVATE_JWK` كسر و`VITE_PUSH_PUBLIC_KEY` وقت البناء). `deploy.yml` لا يمرّر هذه القيم؛ راجع قسم Web Push أدناه.
- التخزين لسه localStorage (مش IndexedDB/Dexie)، والمزامنة صف JSON واحد لكل مستخدم مع تحكم تفاؤلي بالنسخة.

## Web Push (تذكير الدواء والتطبيق مقفول)
1. `node scripts/gen-vapid.mjs` يولّد المفتاحين.
2. المفتاح العام: `VAPID_PUBLIC_KEY` في `worker/wrangler.toml` و`VITE_PUSH_PUBLIC_KEY` في `.env`. الخاص: `npx wrangler secret put VAPID_PRIVATE_JWK --config worker/wrangler.toml`. (استبدل أيضًا قيمتي `VAPID_PUBLIC_KEY` و`VAPID_SUBJECT` النائبتين في `wrangler.toml`.)
3. `npx wrangler deploy --config worker/wrangler.toml` (الـ cron كل 5 دقايق موجود في `wrangler.toml`).
4. المستخدم يسجّل دخول ثم يضغط "تفعيل التذكير والتطبيق مقفول" في تبويب الأدوية.

الخصوصية: السيرفر بيخزّن اشتراك المتصفح + المواعيد (HH:MM) + المنطقة الزمنية فقط. أسماء الأدوية بتفضل على الجهاز والـ service worker هو اللي بيبني نص الإشعار. الاشتراكات بتنتهي بعد 40 يوم من غير فتح التطبيق.
حدود: التأخير لحد 5 دقايق (للدقة غيّر الـ cron لكل دقيقة، ده بيحتاج Workers Paid)، وحد أقصى ~40 إشعار في كل تشغيل، و5 أجهزة لكل مستخدم. iOS بيدعم Web Push بس للتطبيق المثبّت على الشاشة الرئيسية (iOS 16.4+).
