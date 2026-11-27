import { renderFoodCard } from "./food.ts";
import { EXERCISES, getExercise, needsSideView } from "../core/exercises/index.ts";
import type { ExerciseDef, Landmark } from "../core/exercises/types.ts";
import { computeMetrics, bodyFraming, viewOrientation } from "../core/pose/angles.ts";
import { createSmoother } from "../core/pose/smoothing.ts";
import { createLandmarkFilter } from "../core/pose/one-euro.ts";
import { createFpsGovernor, lighterTier, startTier } from "../core/pose/model-tier.ts";
import type { PoseTier } from "../core/pose/model-tier.ts";
import { createPoseLoop } from "../core/pose/scheduler.ts";
import type { FrameScheduler } from "../core/pose/scheduler.ts";
import { createCounter } from "../core/repCounter.ts";
import type { CounterEvent } from "../core/repCounter.ts";
import { metricKeysFor } from "../core/formChecker.ts";
import { createCueThrottle, sayCount } from "../core/cues.ts";
import { initProfile } from "./profile.ts";
import { renderExerciseDetails, renderRestTimer, nextSetNumber, stopRestTimer } from "./exercise-details.ts";
import { EXERCISE_COPY, copyText, cueText, exerciseName } from "./exercise-copy.ts";
import { $, showToast } from "./ui.ts";
import { initReminders } from "./reminders.ts";
import { initParq, openParq } from "./parq-ui.ts";
import { initBackup } from "./backup.ts";
import { initPush } from "./push.ts";
import { renderTrace } from "./trace-chart.ts";
import { renderIllustration } from "./illustrations.ts";
import { renderFeelingPrompt } from "./feelings.ts";
import { suggestedExerciseId } from "./daily-plan.ts";
import { detectWin } from "../core/engagement.ts";
import { hasSupabaseConfig } from "./cloud-config.ts";
import { store } from "./storage.ts";
import { initMedications, renderMedications } from "./medications.ts";
import { initAssistant } from "./assistant.ts";
import { initProgress, renderProgress } from "./progress.ts";
import type { Settings, FontSize, Theme } from "./storage.ts";
import { initVoice, unlockAudio, speak, setMuted, canSpeakCurrentLocale, playRecordedCue } from "./voice.ts";
import { applyLocale, getLocale, t } from "./i18n.ts";
import { initRoutine } from "./routine.ts";
import { initDailyPlan } from "./daily-plan.ts";

// MediaPipe
// الأولوية للنسخة المستضافة محليًا (web/vendor، بتتجهّز بـ `npm run vendor`) عشان التمرين يشتغل offline فعلًا.
// لو مش موجودة (مثلًا في التطوير) بنرجع للـ CDN بنفس الإصدار المثبّت في package.json.
const MP_VERSION = "0.10.14";
const MP_LOCAL = `${import.meta.env.BASE_URL}vendor/mediapipe`;
const modelFile = (tier: PoseTier) => `pose_landmarker_${tier}.task`;
const MP_LOCAL_MODEL = (tier: PoseTier) => `${import.meta.env.BASE_URL}vendor/models/${modelFile(tier)}`;
const MP_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MP_CDN_MODEL = (tier: PoseTier) => `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${tier}/float16/1/${modelFile(tier)}`;
// لو العد طلع أسوأ بالـ 3D غيّرها لـ false
const USE_WORLD_LANDMARKS = true;

interface PoseLandmarkerLike {
  detectForVideo(video: HTMLVideoElement, ts: number): { landmarks?: Landmark[][]; worldLandmarks?: Landmark[][] };
  close(): void;
}

export function nextInferenceDelay(frameDurationMs: number, targetFps = 20): number {
  return Math.max(0, 1000 / targetFps - frameDurationMs);
}

let settings: Settings = store.getSettings();
// الإعدادات والواجهة العامة
function applySettings(): void {
  document.documentElement.classList.remove("fs-large", "fs-xlarge");
  if (settings.fontSize !== "normal") document.documentElement.classList.add(`fs-${settings.fontSize}`);
  setMuted(settings.muted);
  $<HTMLInputElement>("set-easy").checked = settings.level === "easy";
  $<HTMLInputElement>("set-mute").checked = settings.muted;
  pressSeg($("set-font"), settings.fontSize);
  pressSeg($("set-facing"), settings.facing);
  pressSeg($("set-theme"), settings.theme);
  pressSeg($("set-posemodel"), settings.poseModel ?? "standard");
  applyTheme(settings.theme);
}
function applyTheme(theme: Theme): void {
  if (theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" || (theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches) ? "#0e1514" : "#f5f7f7");
}
function pressSeg(seg: HTMLElement, value: string): void {
  seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === value)));
}
function update(patch: Partial<Settings>): void {
  settings = { ...store.getSettings(), ...patch }; // نقرا آخر نسخة من التخزين: المزامنة أو تبويب تاني ممكن يكونوا غيّروها
  store.saveSettings(settings);
  applySettings();
}

function initChrome(): void {
  applyLocale();
  initVoice();
  applySettings();
  if (!settings.accepted) $("welcome").hidden = false;
  $("btn-accept").onclick = () => {
    update({ accepted: true });
    $("welcome").hidden = true;
  };
  $("btn-language").onclick = () => applyLocale(getLocale() === "ar" ? "en" : "ar");
  $("btn-account").onclick = () => window.dispatchEvent(new Event("healthmate:open-account"));
  $("btn-settings").onclick = () => ($("settings").hidden = false);
  $("btn-close-settings").onclick = () => ($("settings").hidden = true);
  $<HTMLInputElement>("set-easy").onchange = (e) => update({ level: (e.target as HTMLInputElement).checked ? "easy" : "normal" });
  $<HTMLInputElement>("set-mute").onchange = (e) => update({ muted: (e.target as HTMLInputElement).checked });
  $("set-font").onclick = (e) => {
    const v = (e.target as HTMLElement).dataset.v as FontSize | undefined;
    if (v) update({ fontSize: v });
  };
  $("set-facing").onclick = (e) => {
    const v = (e.target as HTMLElement).dataset.v as Settings["facing"] | undefined;
    if (v) update({ facing: v });
  };
  $("set-posemodel").onclick = (e) => {
    const v = (e.target as HTMLElement).dataset.v as Settings["poseModel"] | undefined;
    if (v) { tierCap = null; update({ poseModel: v }); } // نجرب الموديل المطلوب من الأول
  };
  $("set-theme").onclick = (e) => {
    const v = (e.target as HTMLElement).dataset.v as Theme | undefined;
    if (v) update({ theme: v });
  };
  $("btn-open-parq").onclick = () => { $("settings").hidden = true; openParq(); };
  $("btn-wipe").onclick = () => void wipeAllData();
  window.addEventListener("healthmate:refresh", () => { settings = store.getSettings(); applySettings(); });
  window.addEventListener("healthmate:navigate", (event) => {
    const tab = (event as CustomEvent<string>).detail;
    if (["workout", "progress", "food", "medications", "assistant"].includes(tab)) {
      showTab(tab as "workout" | "progress" | "food" | "medications" | "assistant");
    }
  });
}

/** مسح كل البيانات: لو في حساب مسجّل، بنمسح السحابة الأول (ولو فشل ما نمسحش المحلي، وإلا المزامنة هترجّع البيانات). */
async function wipeAllData(): Promise<void> {
  if (!confirm(t("clearConfirm"))) return;
  if (hasSupabaseConfig) {
    const { deleteCloudData } = await import("./cloud-sync.ts");
    if ((await deleteCloudData()) === "failed") { showToast(t("cloudWipeFailed"), 6000); return; }
  }
  store.clearAll();
  location.reload();
}

function showTab(tab: "workout" | "progress" | "food" | "medications" | "assistant"): void {
  for (const name of ["workout", "progress", "food", "medications", "assistant"] as const) $("tab-" + name).hidden = tab !== name;
  if (tab === "progress") renderProgress();
  if (tab === "food") renderFoodCard();
  if (tab === "medications") renderMedications();
  if (tab === "workout" && session) endSession(false); // مغادرة الشاشة توقف الكاميرا
}

// اختيار التمرين: فلاتر بالمجموعة العضلية + معلومات تساعد على الاختيار + تمييز التمرين المقترح
type ExerciseFilter = "all" | "legs" | "core" | "upper";
let exerciseFilter: ExerciseFilter = "all";
const EXERCISE_CATEGORY: Record<string, Exclude<ExerciseFilter, "all">> = {
  squat: "legs", lunge: "legs", glute_bridge: "legs", wall_sit: "legs", sit_to_stand: "legs", high_knees: "legs", goblet_squat: "legs",
  plank: "core", mountain_climbers: "core", leg_raise: "core",
  pushup: "upper", biceps_curl: "upper", shoulder_press: "upper", lateral_raise: "upper", romanian_deadlift: "upper",
};
const FILTERS: { id: ExerciseFilter; key: "filterAll" | "filterLegs" | "filterCore" | "filterUpper" }[] = [
  { id: "all", key: "filterAll" }, { id: "legs", key: "filterLegs" }, { id: "core", key: "filterCore" }, { id: "upper", key: "filterUpper" },
];

function renderFilters(): void {
  const box = $("exercise-filters");
  box.innerHTML = "";
  for (const f of FILTERS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "exercise-filter";
    btn.textContent = t(f.key);
    btn.setAttribute("aria-pressed", String(exerciseFilter === f.id));
    btn.onclick = () => { exerciseFilter = f.id; renderPicker(); };
    box.append(btn);
  }
}

function lastSessionFor(id: string): { goodReps: number; badReps: number; holdSeconds: number } | undefined {
  const all = store.getSessions();
  for (let i = all.length - 1; i >= 0; i--) {
    const row = all[i];
    if (!row.deleted && row.exerciseId === id) return row;
  }
  return undefined;
}

function renderPicker(): void {
  const cards = $("cards");
  cards.innerHTML = "";
  const weightedCards = $("cards-weighted");
  weightedCards.innerHTML = "";
  renderFilters();
  const suggested = suggestedExerciseId();
  let visibleWeighted = 0;
  for (const ex of EXERCISES) {
    if (exerciseFilter !== "all" && EXERCISE_CATEGORY[ex.id] !== exerciseFilter) continue;
    const isSuggested = ex.id === suggested;
    const b = document.createElement("button");
    b.className = isSuggested ? "exercise-card is-suggested" : "exercise-card";
    const copy = EXERCISE_COPY[ex.id];
    b.innerHTML = `<span class="exercise-card-art"></span><span class="exercise-copy"><b></b><small></small><span class="exercise-meta"></span><span class="muscle-badge"></span></span><span class="exercise-start"><span data-start></span><svg class="exercise-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></span>`;
    const art = b.querySelector(".exercise-card-art")!;
    // الصور الأصلية على الكروت (تحميل كسول + كاش بعد أول مرة)، والرسم المتحرك احتياطي لو الصورة ناقصة
    const imageName = EXERCISE_PHOTOS[ex.id];
    if (imageName) {
      const img = document.createElement("img");
      img.className = "exercise-card-photo";
      img.src = `${import.meta.env.BASE_URL}images/exercises/${imageName}`;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
      art.append(img);
    } else {
      const illustration = renderIllustration(ex.id, exerciseName(ex.id), false);
      if (illustration) {
        illustration.setAttribute("aria-hidden", "true");
        illustration.removeAttribute("role");
        illustration.removeAttribute("aria-label");
        art.append(illustration);
      } else {
        art.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${copy?.icon ?? "M4 12h16"}"/></svg>`;
      }
    }
    b.querySelector("b")!.textContent = copy ? copyText(copy.name) : ex.id;
    b.querySelector("small")!.textContent = copy ? copyText(copy.hint) : "";
    b.querySelector(".muscle-badge")!.textContent = copy ? copyText(copy.muscle) : "";
    // معلومات القرار: النوع/المدة + آخر نتيجة
    const meta: string[] = [ex.durationSec ? t("metaTimed", { seconds: ex.durationSec }) : t(ex.mode === "hold" ? "metaHold" : "metaReps")];
    const last = lastSessionFor(ex.id);
    if (last) meta.push(ex.mode === "hold" ? t("lastHold", { n: Math.round(last.holdSeconds) }) : t("lastReps", { n: last.goodReps }));
    b.querySelector(".exercise-meta")!.textContent = meta.join(" · ");
    // الكارت كله بيشتغل؛ زر لايم واضح للتمرين المقترح بس، والباقي سهم هادي
    const startEl = b.querySelector(".exercise-start")!;
    if (isSuggested) {
      b.querySelector("[data-start]")!.textContent = t("startCamera");
    } else {
      startEl.classList.add("is-quiet");
      startEl.setAttribute("aria-hidden", "true");
    }
    b.onclick = () => openIntro(ex);
    if (ex.weighted) { weightedCards.appendChild(b); visibleWeighted++; } else cards.appendChild(b);
  }
  $("weighted-section").hidden = visibleWeighted === 0;
}
// صور التمارين على كروت الاختيار (اسم الملف بالامتداد)
const EXERCISE_PHOTOS: Record<string, string> = { squat: "squat.webp", pushup: "pushup.webp", plank: "plank.webp", lunge: "lunge.webp", glute_bridge: "glute-bridge.webp", wall_sit: "wall-sit.webp", sit_to_stand: "sit-to-stand.webp", high_knees: "high-knees.jpg", mountain_climbers: "mountain-climbers.jpg", leg_raise: "leg-raise.jpg", goblet_squat: "goblet-squat.jpg", biceps_curl: "biceps-curl.jpg", shoulder_press: "shoulder-press.jpg", lateral_raise: "lateral-raise.jpg", romanian_deadlift: "romanian-deadlift.jpg" };

function openIntro(ex: ExerciseDef): void {
  pendingExercise = ex;
  $("picker").hidden = true;
  $("session").hidden = false;
  $("intro").hidden = false;
  $("live").hidden = true;
  $("summary").hidden = true;
  renderIntro(ex);
}
function renderIntro(ex: ExerciseDef): void {
  $("intro-title").textContent = `${exerciseName(ex.id)}${settings.level === "easy" ? ` (${t("easyMode")})` : ""}`;
  const art = $("intro-art");
  art.replaceChildren();
  const svg = renderIllustration(ex.id, exerciseName(ex.id));
  if (svg) art.append(svg);
  const notes = [needsSideView(ex) ? t("sideViewHint") : "", ex.durationSec ? t("timedHint", { seconds: ex.durationSec }) : ""].filter(Boolean).map(String);
  // تلميح تركيز من أكتر خطأ اتكرر في آخر 5 جلسات لنفس التمرين
  const recentErrs = store.getSessions().filter((r) => !r.deleted && r.exerciseId === ex.id && r.errors?.length).slice(-5);
  if (recentErrs.length) {
    const counts = new Map<string, number>();
    for (const r of recentErrs) for (const id of r.errors ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) notes.push(t("focusTip", { cue: cueText(ex.id, top[0]) }));
  }
  $("intro-notes").textContent = notes.join(" ");
  let details = document.getElementById("intro-details");
  if (!details) { details = document.createElement("div"); details.id = "intro-details"; details.className = "intro-details"; $("intro-notes").after(details); }
  renderExerciseDetails(ex.id, details);
  $("intro-error").hidden = true;
}
function backToPicker(): void {
  stopRestTimer();
  $("session").hidden = true;
  $("picker").hidden = false;
}

// الجلسة
interface Session {
  def: ExerciseDef;
  stream: MediaStream;
  counter: ReturnType<typeof createCounter>;
  smoother: ReturnType<typeof createSmoother>;
  filter: ReturnType<typeof createLandmarkFilter>;
  worldFilter: ReturnType<typeof createLandmarkFilter>;
  governor: ReturnType<typeof createFpsGovernor>;
  lowConf: number;
  lastLowAt: number;
  throttle: ReturnType<typeof createCueThrottle>;
  keys: ReturnType<typeof metricKeysFor>;
  phase: "setup" | "active";
  okSince: number | null;
  lostFrames: number;
  lastFailAt: number;
  recentRepQuality: boolean[];
  startedAt: number;
  loop: { start(): void; stop(): void };
  lastVideoTime: number;
  wake: { release(): Promise<void> } | null;
  /** عينات القيمة الأساسية (زاوية الحركة) لرسم الملخص. بتفضل في الذاكرة بس. */
  trace: number[];
  lastTraceAt: number;
  activeAt: number;
  viewWarned: boolean;
  pain: boolean;
  /** عداد أخطاء الوضعية في الجلسة (لملخص "أكتر خطأ" وتلميح التركيز) */
  errorCounts: Record<string, number>;
  /** آخر توجيه تأطير اتقال صوتيًا ووقته (مانع تكرار كل فريم) */
  lastFramingKey: string;
  lastFramingAt: number;
}
let pendingExercise: ExerciseDef | null = null;
let session: Session | null = null;
let landmarker: PoseLandmarkerLike | null = null;
let landmarkerTier: PoseTier | null = null;
let landmarkerLoading: Promise<PoseLandmarkerLike> | null = null;
// لو نزلنا لموديل أخف بنفضل عليه لحد ما المستخدم يغيّر الإعداد
let tierCap: PoseTier | null = null;

async function urlAvailable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    const type = res.headers.get("content-type") ?? "";
    return res.ok && !type.includes("text/html"); // السيرفر ممكن يرجّع index.html لأي مسار مش موجود
  } catch { return false; }
}

async function createLandmarker(tier: PoseTier): Promise<PoseLandmarkerLike> {
  const local = await urlAvailable(`${MP_LOCAL}/vision_bundle.mjs`);
  const base = local ? MP_LOCAL : MP_CDN;
  // heavy تقيل (30MB) فبيتحمّل من النت، والباقي محلي لو موجود
  const model = tier !== "heavy" && (await urlAvailable(MP_LOCAL_MODEL(tier))) ? MP_LOCAL_MODEL(tier) : MP_CDN_MODEL(tier);
  const mod = await import(/* @vite-ignore */ `${base}/vision_bundle.mjs`);
  const fileset = await mod.FilesetResolver.forVisionTasks(`${base}/wasm`);
  const make = (delegate: "GPU" | "CPU") =>
    mod.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: model, delegate },
      runningMode: "VIDEO",
      numPoses: 1,
    }) as Promise<PoseLandmarkerLike>;
  try {
    return await make("GPU");
  } catch {
    return await make("CPU"); // بعض الأجهزة مفيهاش GPU delegate
  }
}

// لو التحميل فشل بينزل للأخف
async function loadLandmarker(): Promise<PoseLandmarkerLike> {
  const wanted = tierCap ?? startTier(settings.poseModel);
  if (landmarker && landmarkerTier === wanted) return landmarker;
  landmarkerLoading ??= (async () => {
    let tier: PoseTier | null = wanted;
    let lastErr: unknown = new Error("no_model");
    while (tier) {
      try {
        const lm = await createLandmarker(tier);
        const old = landmarker;
        landmarker = lm; landmarkerTier = tier;
        if (old && old !== lm) { try { old.close(); } catch { /* تجاهل */ } }
        if (tier !== wanted) tierCap = tier;
        return lm;
      } catch (err) { lastErr = err; tier = lighterTier(tier); }
    }
    throw lastErr;
  })();
  try {
    return await landmarkerLoading;
  } finally {
    landmarkerLoading = null; // نسمح بإعادة المحاولة أو بتغيير الموديل
  }
}

let downgrading = false;
// الجهاز بطيء: نجرب موديل أخف من غير ما نوقف الجلسة
async function downgradeModel(s: Session): Promise<void> {
  if (downgrading || !landmarkerTier) return;
  const next = lighterTier(landmarkerTier);
  if (!next) return;
  downgrading = true;
  try {
    const lm = await createLandmarker(next);
    if (!session || session !== s) { try { lm.close(); } catch { /* تجاهل */ } return; }
    const old = landmarker;
    landmarker = lm; landmarkerTier = next; tierCap = next;
    if (old) { try { old.close(); } catch { /* تجاهل */ } }
    s.governor.reset();
    showToast(t("modelLighter"));
  } catch { /* نكمّل على الموديل الحالي */ } finally { downgrading = false; }
}

function setStatus(message: string): void {
  $("status").textContent = message;
}
function setMsg(t: string): void {
  $("msg").textContent = t;
}

/** نص يظهر للمستخدم لو الصوت مش متاح (مكتوم أو مفيش صوت عربي على الجهاز) */
function announce(text: string, opts: { interrupt?: boolean } = {}): void {
  if (!speak(text, opts) && text) setMsg(text);
}

// ترتيب التسجيلات يطابق تعليمات بداية التمرين ثم تنبيهات الوضعية لكل تمرين.
const START_RECORDINGS: Record<string, number> = {
  squat: 1, pushup: 4, plank: 7, lunge: 10, glute_bridge: 13, wall_sit: 15, sit_to_stand: 19,
};
const CUE_RECORDINGS: Record<string, number> = {
  "squat:depth": 2, "squat:back": 3, "pushup:depth": 5, "pushup:line": 6,
  "plank:sag": 8, "plank:pike": 9, "lunge:lungeDepth": 11, "lunge:back": 12,
  "glute_bridge:bridgeLift": 14, "wall_sit:wallHigh": 16, "wall_sit:wallLow": 17,
  "wall_sit:wallBack": 18, "sit_to_stand:sitDepth": 20,
};
function speakExerciseCue(recording: number | undefined, text: string, opts: { interrupt?: boolean } = {}): void {
  if (recording && getLocale() === "ar") playRecordedCue(recording, text, opts);
  else if (!speak(text, opts) && text) setMsg(text);
}
function cueRecording(exerciseId: string, cueId: string): number | undefined {
  return CUE_RECORDINGS[`${exerciseId}:${cueId}`];
}

/** تسجيلات توجيه التأطير في مرحلة التجهيز (web/audio/recording-21..24.mp3) */
const FRAMING_RECORDINGS: Record<string, number> = { no_body: 21, too_close: 22, cut_off: 23, turnSideways: 24 };

/** بتتكلم عن مشكلة التأطير مرة لكل تغيير، أو كل 7 ثواني لو المشكلة مستمرة */
function speakFraming(s: Session, key: string, text: string, now: number): void {
  if (key === s.lastFramingKey && now - s.lastFramingAt < 7000) return;
  s.lastFramingKey = key;
  s.lastFramingAt = now;
  speakExerciseCue(FRAMING_RECORDINGS[key], text);
}

async function startSession(): Promise<void> {
  unlockAudio(); // لازم قبل أي await عشان iOS يعتبرها لمسة مستخدم
  const def = pendingExercise;
  if (!def) return;
  // استبيان الجاهزية: مرة واحدة قبل أول جلسة
  if (!store.getParq()) { openParq(() => void startSession()); return; }
  $("intro").hidden = true;
  $("live").hidden = false;
  setStatus(t("loadingCamera"));
  setMsg("");

  let stream: MediaStream;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("camera_unavailable");
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: settings.facing, width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
  } catch (err) {
    const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
    failToIntro(
      denied ? t("cameraDenied") : t("cameraFailed"),
    );
    return;
  }

  const video = $<HTMLVideoElement>("video");
  const canvas = $<HTMLCanvasElement>("overlay");
  const mirror = settings.facing === "user";
  video.classList.toggle("mirror", mirror);
  canvas.classList.toggle("mirror", mirror);
  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    failToIntro(t("cameraFailed"));
    return;
  }
  const w = video.videoWidth || 640, h = video.videoHeight || 480;
  canvas.width = w;
  canvas.height = h;
  $("stage").style.aspectRatio = `${w} / ${h}`;

  setStatus(t("modelLoading"));
  try {
    await loadLandmarker();
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    failToIntro(t("modelFailed"));
    return;
  }

  if ($<HTMLElement>("session").hidden || pendingExercise !== def) {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    return;
  }

  const wake = await requestWakeLock();

  session = {
    def,
    stream,
    counter: createCounter(def, settings.level, { minRepMs: 400, maxRepMs: 20_000, lostAbortMs: 2_000 }),
    smoother: createSmoother(3), // الـ landmarks متفلترة فمتوسط أقصر
    filter: createLandmarkFilter(),
    worldFilter: createLandmarkFilter(),
    governor: createFpsGovernor(),
    lowConf: 0,
    lastLowAt: 0,
    throttle: createCueThrottle(4000, 1200),
    keys: metricKeysFor(def),
    phase: "setup",
    okSince: null,
    lostFrames: 0,
    lastFailAt: 0,
    recentRepQuality: [],
    startedAt: Date.now(),
    loop: undefined as unknown as { start(): void; stop(): void },
    lastVideoTime: -1,
    wake,
    trace: [],
    lastTraceAt: 0,
    activeAt: 0,
    viewWarned: false,
    pain: false,
    errorCounts: {},
    lastFramingKey: "",
    lastFramingAt: 0,
  };
  $("stat-hold").hidden = def.mode !== "hold";
  $("stat-time").hidden = !def.durationSec;
  $("n-time").textContent = String(def.durationSec ?? 0);
  $("voice-note").hidden = settings.muted || canSpeakCurrentLocale();
  $("btn-skip-setup").hidden = false;
  $("btn-skip-setup").onclick = () => {
    const current = session;
    if (current?.phase === "setup") activate(current);
  };
  renderHud();
  setStatus(t("positionPhone"));
  document.addEventListener("visibilitychange", reacquireWakeLock);
  const current = session;
  current.loop = createPoseLoop(browserFrameScheduler, () => processFrame(current), 20, () => {
    setStatus(t("modelFailed"));
    endSession(false);
  });
  current.loop.start();
}

/** زرار الألم: بيوقف الجلسة فورًا ويسجّلها كجلسة فيها ألم (بتظهر للطبيب في التقرير) */
function reportPain(): void {
  const s = session;
  if (!s) return;
  s.pain = true;
  endSession(true);
}

/** زرار "مش مرتاح": بيوقف الجلسة فورًا ويطلع إرشادات الأمان (اقعد، اشرب مية، اطلب مساعدة) */
function reportUnwell(): void {
  if (session) endSession(false);
  $("unwell-overlay").hidden = false;
}

/** الرسالة بتظهر جوه الصفحة (role=alert) بدل alert() اللي بيقفل الشاشة */
function failToIntro(message: string): void {
  $("live").hidden = true;
  $("intro").hidden = false;
  const box = $("intro-error");
  box.textContent = message;
  box.hidden = false;
}

type WakeSentinel = { release(): Promise<void> };
async function requestWakeLock(): Promise<WakeSentinel | null> {
  try {
    const wl = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<WakeSentinel> } }).wakeLock;
    return (await wl?.request("screen")) ?? null;
  } catch { return null; }
}
/** المتصفح بيفلت الـ wakeLock لما التبويب يتخفى، فلازم نطلبه تاني عند الرجوع وإلا الشاشة هتنطفي في نص التمرين */
function reacquireWakeLock(): void {
  const s = session;
  if (!s || document.visibilityState !== "visible") return;
  void requestWakeLock().then((lock) => {
    if (!session || session !== s) { void lock?.release().catch(() => undefined); return; }
    void s.wake?.release().catch(() => undefined);
    s.wake = lock;
  });
}

const framingKey: Record<ReturnType<typeof bodyFraming>, "noBody" | "tooClose" | "cutOff" | "ready"> = {
  no_body: "noBody", too_close: "tooClose", cut_off: "cutOff", ok: "ready",
};
const framingMessage = (framing: ReturnType<typeof bodyFraming>) => t(framingKey[framing]);

function activate(s: Session): void {
  s.phase = "active";
  s.smoother.reset();
  $("btn-skip-setup").hidden = true;
  s.activeAt = performance.now();
  s.counter.reset();
  setStatus(exerciseName(s.def.id));
  const startKey = EXERCISE_COPY[s.def.id]?.start;
  if (startKey) speakExerciseCue(START_RECORDINGS[s.def.id], copyText(startKey), { interrupt: true });
}

const browserFrameScheduler: FrameScheduler = {
  requestAnimationFrame: (callback) => requestAnimationFrame(callback),
  cancelAnimationFrame: (id) => cancelAnimationFrame(id),
  setTimeout: (callback, delay) => window.setTimeout(callback, delay),
  clearTimeout: (id) => window.clearTimeout(id),
};

function processFrame(s: Session): number {
  if (!session || session !== s || !landmarker) return 0;
  const video = $<HTMLVideoElement>("video");
  if (video.readyState < 2 || video.currentTime === s.lastVideoTime) return 0;
  s.lastVideoTime = video.currentTime;

  const now = performance.now();
  const res = landmarker.detectForVideo(video, now);
  const inferenceDuration = performance.now() - now;
  const rawLms = res.landmarks?.[0];
  const lms = rawLms ? s.filter.apply(rawLms, now) : undefined;
  const rawWorld = USE_WORLD_LANDMARKS ? res.worldLandmarks?.[0] : undefined;
  const world = rawWorld ? s.worldFilter.apply(rawWorld, now) : undefined;
  if (s.governor.record(inferenceDuration)) void downgradeModel(s);
  const canvas = $<HTMLCanvasElement>("overlay");
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!lms) {
    s.lostFrames++;
    if (s.lostFrames > 10) { s.smoother.reset(); s.filter.reset(); s.worldFilter.reset(); }
    if (s.phase === "setup") setStatus(framingMessage("no_body"));
    s.counter.update({}, now); // يقطع حساب الثبات
    return inferenceDuration;
  }
  s.lostFrames = 0;

  if (s.phase === "setup") {
    const framing = bodyFraming(lms);
    // التصوير من الأمام بيحسب زوايا المفاصل غلط، فمنبدأش تلقائي لحد ما المستخدم يقف بجنبه (أو يضغط "ابدأ الآن")
    const front = needsSideView(s.def) && viewOrientation(lms, canvas.width / canvas.height) === "front";
    if (framing === "ok" && front) {
      setStatus(t("turnSideways"));
      drawSkeleton(ctx, lms, "#f59e0b");
      s.okSince = null;
      speakFraming(s, "turnSideways", t("turnSideways"), now);
      return inferenceDuration;
    }
    setStatus(framingMessage(framing));
    drawSkeleton(ctx, lms, framing === "ok" ? "#22c55e" : "#f59e0b");
    if (framing === "ok") {
      s.okSince ??= now;
      if (now - s.okSince > 1000) activate(s);
    } else {
      s.okSince = null;
      speakFraming(s, framing, framingMessage(framing), now);
    }
    return inferenceDuration;
  }

  const metrics = s.smoother.push(computeMetrics(lms, s.keys, 0.5, { aspect: canvas.width / canvas.height, world }));
  const primary = metrics[s.def.primary];
  // لو القياس الأساسي مش ظاهر حوالي ثانيتين نقول للمستخدم يظبط الإضاءة
  s.lowConf = primary === undefined ? s.lowConf + 1 : 0;
  if (s.lowConf >= 40 && now - s.lastLowAt > 8000) { s.lastLowAt = now; s.lowConf = 0; setMsg(t("lowConfidence")); }
  if (primary !== undefined && now - s.lastTraceAt >= 150) { s.trace.push(Math.round(primary * (s.def.primary === "hipDrop" ? 1000 : 10)) / (s.def.primary === "hipDrop" ? 1000 : 10)); s.lastTraceAt = now; }
  const events = s.counter.update(metrics, now);
  if (s.def.durationSec) {
    const left = Math.max(0, s.def.durationSec - (now - s.activeAt) / 1000);
    $("n-time").textContent = String(Math.ceil(left));
    if (left <= 0) { endSession(true); return inferenceDuration; }
  }
  for (const ev of events) handleEvent(s, ev, now);
  const failing = now - s.lastFailAt < 700;
  drawSkeleton(ctx, lms, failing ? "#ef4444" : "#22c55e");
  renderHud();
  return inferenceDuration;
}

function handleEvent(s: Session, ev: CounterEvent, now: number): void {
  const { def, throttle } = s;
  if (ev.type === "feedback") {
    s.lastFailAt = now;
    s.errorCounts[ev.id] = (s.errorCounts[ev.id] ?? 0) + 1;
    const message = cueText(s.def.id, ev.id);
    setMsg(message);
    if (throttle.allow(`fb:${ev.id}`, now)) speakExerciseCue(cueRecording(s.def.id, ev.id), message); // الرسالة ظاهرة نصًا أصلًا
  } else if (ev.type === "rep") {
    s.recentRepQuality.push(ev.correct);
    if (s.recentRepQuality.length > 5) s.recentRepQuality.shift();
    if (ev.correct) {
      setMsg("");
      const count = getLocale() === "ar" ? sayCount(s.counter.state.goodReps) : String(s.counter.state.goodReps);
      if (!speak(count, { interrupt: true }) && !canSpeakCurrentLocale()) setMsg(`✓ ${s.counter.state.goodReps}`);
    } else {
      const message = ev.errors[0] ? cueText(s.def.id, ev.errors[0]) : "";
      for (const err of ev.errors) s.errorCounts[err] = (s.errorCounts[err] ?? 0) + 1;
      setMsg(message);
      s.lastFailAt = now;
      if (message && throttle.allow(`fb:${ev.errors[0]}`, now)) speakExerciseCue(cueRecording(s.def.id, ev.errors[0]), message, { interrupt: true });
    }
    const struggling = s.recentRepQuality.length === 5 && s.recentRepQuality.filter((correct) => !correct).length >= 3;
    if (struggling && throttle.allow("form-fatigue-prompt", now)) {
      const prompt = t("fatigueFormPrompt");
      announce(prompt, { interrupt: true });
    }
  } else if (ev.type === "milestone") {
    setMsg("");
    if (def.cues.holdMilestone) announce(`${ev.seconds} ${t("secondsUnit")}. ${t("holdPraise")}`, { interrupt: true });
  } else if (ev.type === "abort" && ev.reason !== "too_fast") {
    setMsg(t("repCancelled"));
  }
}

let hudReduceMotion: boolean | null = null;
function pulseStat(el: HTMLElement, value: string): void {
  if (el.textContent === value) return;
  el.textContent = value;
  if (hudReduceMotion === null) hudReduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (hudReduceMotion) return;
  el.animate(
    [
      { transform: "scale(1.35)", color: "var(--accent)" },
      { transform: "scale(1)" },
    ],
    { duration: 300, easing: "cubic-bezier(.22,1,.36,1)" }
  );
}

function renderHud(): void {
  const s = session;
  if (!s) return;
  pulseStat($("n-good"), String(s.counter.state.goodReps));
  pulseStat($("n-hold"), String(Math.floor(s.counter.state.holdSeconds)));
  $("n-bad").textContent = String(s.counter.state.badReps);
}

const POSE_LINES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
];
function drawSkeleton(ctx: CanvasRenderingContext2D, lms: Landmark[], color: string): void {
  const { width: W, height: H } = ctx.canvas;
  ctx.lineWidth = Math.max(4, W / 120);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  const ok = (l?: Landmark) => !!l && (l.visibility ?? 0) >= 0.5;
  for (const [a, b] of POSE_LINES) {
    if (!ok(lms[a]) || !ok(lms[b])) continue;
    ctx.beginPath();
    ctx.moveTo(lms[a].x * W, lms[a].y * H);
    ctx.lineTo(lms[b].x * W, lms[b].y * H);
    ctx.stroke();
  }
  for (const i of new Set(POSE_LINES.flat())) {
    if (!ok(lms[i])) continue;
    ctx.beginPath();
    ctx.arc(lms[i].x * W, lms[i].y * H, ctx.lineWidth * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

function endSession(showSummary: boolean): void {
  const s = session;
  if (!s) return;
  s.loop.stop();
  document.removeEventListener("visibilitychange", reacquireWakeLock);
  s.stream.getTracks().forEach((t) => t.stop()); // نوقف الكاميرا فعليًا
  $<HTMLVideoElement>("video").srcObject = null;
  void s.wake?.release().catch(() => undefined);
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  session = null;

  const { goodReps, badReps, holdSeconds } = s.counter.state;
  const active = s.pain || (s.def.mode === "hold" ? holdSeconds >= 3 : goodReps + badReps > 0);
  const topErrors = Object.entries(s.errorCounts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => id);
  // آخر جلسة سابقة لنفس التمرين (قبل حفظ الحالية) عشان المقارنة
  let prevSame: import("../core/coach/rules").SessionRecord | undefined;
  const history = store.getSessions();
  for (let i = history.length - 1; i >= 0; i--) {
    const r = history[i];
    if (!r.deleted && r.exerciseId === s.def.id) { prevSame = r; break; }
  }
  if (active) store.addSession({ exerciseId: s.def.id, goodReps, badReps, holdSeconds: Math.round(holdSeconds), at: Date.now(), ...(s.pain ? { pain: true } : {}), ...(topErrors.length ? { errors: topErrors } : {}) });

  $("live").hidden = true;
  if (showSummary && active) {
    const body = $("summary-body");
    const total = goodReps + badReps;
    const mins = Math.max(1, Math.round((Date.now() - s.startedAt) / 60000));
    body.innerHTML = "";
    const lines =
      s.def.mode === "hold"
        ? [t("holdSummary", { seconds: Math.round(holdSeconds) })]
        : total === 0 ? [] : [t("repSummary", { good: goodReps, bad: badReps }), t("accuracySummary", { accuracy: Math.round((goodReps / total) * 100) })];
    lines.push(t("durationSummary", { minutes: mins }));
    if (topErrors.length) lines.push(t("mistakeSummary", { cue: cueText(s.def.id, topErrors[0]) }));
    if (prevSame && !s.pain) {
      const mine = s.def.mode === "hold" ? Math.round(holdSeconds) : goodReps;
      const theirs = s.def.mode === "hold" ? prevSame.holdSeconds : prevSame.goodReps;
      lines.push(t(mine > theirs ? "compareBetter" : mine < theirs ? "compareWorse" : "compareSame", { n: theirs }));
    }
    if (s.pain) lines.unshift(t("painStopped"), t("painAdvice"));
    if (s.def.durationSec) lines.unshift(t("timedResult", { count: goodReps + badReps, seconds: s.def.durationSec }));
    for (const l of lines) {
      const p = document.createElement("p");
      p.textContent = l;
      body.appendChild(p);
    }
    // المكسب الصغير: تهنئة شخصية فوق الملخص (مفيش تهنئة لو الجلسة اتوقفت بألم)
    if (!s.pain) {
      const win = detectWin({ exerciseId: s.def.id, mode: s.def.mode, goodReps, holdSeconds, sessions: history, now: Date.now() });
      const winEl = document.createElement("p");
      winEl.className = "win-line";
      winEl.textContent =
        win.kind === "personal_best" ? t("winPersonalBest")
        : win.kind === "streak" ? t("winStreak", { n: win.days })
        : win.kind === "first" ? t("winFirst")
        : t("winDone");
      body.prepend(winEl);
    }
    if (s.def.durationSec) { const note = document.createElement("p"); note.className = "hint"; note.textContent = t("timedResultNote"); body.appendChild(note); }
    const guides = s.def.mode === "reps" ? { up: s.def.inverted ? s.def.downBelow[settings.level] : s.def.upAbove[settings.level], down: s.def.inverted ? s.def.upAbove[settings.level] : s.def.downBelow[settings.level] } : {};
    const chart = renderTrace(s.trace, guides);
    if (chart) {
      const caption = document.createElement("p"); caption.className = "hint"; caption.textContent = t("traceCaption");
      chart.setAttribute("aria-label", t("traceCaption"));
      body.append(caption, chart);
    }
    renderFeelingPrompt(body, s.def.id);
    if (!s.pain) renderRestTimer(body, () => { $("summary").hidden = true; openIntro(s.def); }, nextSetNumber(s.def.id));
    $("summary").hidden = false;
    speak(s.pain ? t("painStopped") : t("finishedWorkout"));
  } else {
    backToPicker();
  }
}

// تشغيل
initChrome();
window.addEventListener("healthmate:start-exercise", (event) => {
  const id = (event as CustomEvent<string>).detail;
  const ex = EXERCISES.find((e) => e.id === id);
  if (ex) { showTab("workout"); openIntro(ex); }
});
// بدء سريع بضغطة واحدة: بيدخل على الجلسة على طول من غير شاشة المقدمة
window.addEventListener("healthmate:quick-start", (event) => {
  const id = (event as CustomEvent<string>).detail;
  const ex = EXERCISES.find((e) => e.id === id);
  if (!ex) return;
  showTab("workout");
  pendingExercise = ex;
  $("picker").hidden = true;
  $("session").hidden = false;
  $("intro").hidden = true;
  $("live").hidden = false;
  $("summary").hidden = true;
  void startSession();
});
window.addEventListener("healthmate:refresh", () => renderPicker());
window.addEventListener("healthmate:locale", () => {
  renderPicker();
  if (pendingExercise && !$<HTMLElement>("session").hidden) {
    renderIntro(pendingExercise);
  }
  if (session?.phase === "setup") setStatus(t("positionPhone"));
  else if (session?.phase === "active") setStatus(exerciseName(session.def.id));
});
renderPicker();
initDailyPlan();
initProgress({ backToPicker, startSession, endSession, activate, getSession: () => session });
initMedications();
initProfile();
initAssistant();
initRoutine();
// حماية من clickjacking على GitHub Pages (مفيش X-Frame-Options/frame-ancestors هناك): لو الصفحة اتفتحت جوه iframe نخفيها ونطلع منها.
if (window.top !== window.self) {
  document.documentElement.style.display = "none";
  try { if (window.top) window.top.location.href = window.self.location.href; } catch { /* iframe من أصل تاني: الصفحة مخفية أصلًا */ }
}
// شبكة أمان: أي خطأ غير ملتقط يظهر كرسالة هادئة بدل ما التطبيق يبان معلّق (من غير ما نعرض تفاصيل تقنية أو بيانات)
let lastGlobalError = 0;
const reportUnexpected = (): void => {
  if (Date.now() - lastGlobalError < 5000) return;
  lastGlobalError = Date.now();
  showToast(t("unexpectedError"));
};
window.addEventListener("error", reportUnexpected);
window.addEventListener("unhandledrejection", reportUnexpected);
getExercise("squat"); // فحص مبكر إن التعريفات سليمة
initParq();
initBackup();
initPush();
initReminders();
$("btn-pain").onclick = reportPain;
$("btn-unwell").onclick = reportUnwell;
$("btn-unwell-close").onclick = () => { $("unwell-overlay").hidden = true; };
// الـ service worker بيتسجّل من vite-plugin-pwa (registerSW). هنا بس بنستقبل نقر الإشعار.
const requested = new URLSearchParams(location.search).get("tab");
if (requested && ["workout", "progress", "food", "medications", "assistant"].includes(requested)) window.dispatchEvent(new CustomEvent("healthmate:navigate", { detail: requested }));
navigator.serviceWorker?.addEventListener("message", (event) => {
  const data = event.data as { type?: string; tab?: string } | undefined;
  if (data?.type === "navigate" && data.tab) window.dispatchEvent(new CustomEvent("healthmate:navigate", { detail: data.tab }));
});
// لو المستخدم وافق قبل كده على المزامنة، نكمّلها تلقائي (من غير ما يفتح صفحة الحساب)
if (hasSupabaseConfig && localStorage.getItem("hm.cloud.consent")) void import("./cloud-sync.ts").then((m) => m.resumeCloudSync());
