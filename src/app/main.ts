import { renderFoodCard } from "./food.ts";
import { EXERCISES, getExercise, needsSideView } from "../core/exercises/index.ts";
import type { ExerciseDef, Landmark } from "../core/exercises/types.ts";
import { computeMetrics, bodyFraming, viewOrientation } from "../core/pose/angles.ts";
import { createSmoother } from "../core/pose/smoothing.ts";
import { createPoseLoop } from "../core/pose/scheduler.ts";
import type { FrameScheduler } from "../core/pose/scheduler.ts";
import { createCounter } from "../core/repCounter.ts";
import type { CounterEvent } from "../core/repCounter.ts";
import { metricKeysFor } from "../core/formChecker.ts";
import { createCueThrottle, sayCount } from "../core/cues.ts";
import { initProfile } from "./profile.ts";
import { renderExerciseDetails, renderRestTimer, nextSetNumber, stopRestTimer } from "./exercise-details.ts";
import { EXERCISE_COPY, cueText, exerciseName } from "./exercise-copy.ts";
import { $, showToast } from "./ui.ts";
import { initReminders } from "./reminders.ts";
import { initParq, openParq } from "./parq-ui.ts";
import { initBackup } from "./backup.ts";
import { initPush } from "./push.ts";
import { renderTrace } from "./trace-chart.ts";
import { renderIllustration } from "./illustrations.ts";
import { hasSupabaseConfig } from "./cloud-config.ts";
import { store } from "./storage.ts";
import { initMedications, renderMedications } from "./medications.ts";
import { initAssistant } from "./assistant.ts";
import { initProgress, renderProgress } from "./progress.ts";
import type { Settings, FontSize, Theme } from "./storage.ts";
import { initVoice, unlockAudio, speak, setMuted, canSpeakCurrentLocale, playRecordedCue } from "./voice.ts";
import { applyLocale, getLocale, t } from "./i18n.ts";
import { initRoutine } from "./routine.ts";

// MediaPipe
// الأولوية للنسخة المستضافة محليًا (web/vendor، بتتجهّز بـ `npm run vendor`) عشان التمرين يشتغل offline فعلًا.
// لو مش موجودة (مثلًا في التطوير) بنرجع للـ CDN بنفس الإصدار المثبّت في package.json.
const MP_VERSION = "0.10.14";
const MP_LOCAL = `${import.meta.env.BASE_URL}vendor/mediapipe`;
const MP_LOCAL_MODEL = `${import.meta.env.BASE_URL}vendor/models/pose_landmarker_lite.task`;
const MP_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MP_CDN_MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

interface PoseLandmarkerLike {
  detectForVideo(video: HTMLVideoElement, ts: number): { landmarks?: Landmark[][] };
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

// اختيار التمرين
function renderPicker(): void {
  const cards = $("cards");
  cards.innerHTML = "";
  for (const ex of EXERCISES) {
    const b = document.createElement("button");
    b.className = "exercise-card";
    const copy = EXERCISE_COPY[ex.id];
    b.innerHTML = `<span class="exercise-card-art"></span><span class="exercise-copy"><b></b><small></small><span class="muscle-badge"></span></span><span class="exercise-start"><span data-start></span><svg class="exercise-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></span>`;
    const art = b.querySelector(".exercise-card-art")!;
    const photoNames: Record<string, string> = { squat: "squat", pushup: "pushup", plank: "plank", lunge: "lunge", glute_bridge: "glute-bridge", wall_sit: "wall-sit", sit_to_stand: "sit-to-stand" };
    const imageName = photoNames[ex.id];
    if (imageName) {
      const img = document.createElement("img");
      img.className = "exercise-card-photo";
      img.src = `${import.meta.env.BASE_URL}images/exercises/${imageName}.webp`;
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
      img.decoding = "async";
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
    b.querySelector("b")!.textContent = copy ? t(copy.name) : ex.id;
    b.querySelector("small")!.textContent = copy ? t(copy.hint) : "";
    b.querySelector(".muscle-badge")!.textContent = copy ? t(copy.muscle) : "";
    b.querySelector("[data-start]")!.textContent = t("startCamera");
    b.onclick = () => openIntro(ex);
    cards.appendChild(b);
  }
}
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
  const notes = [needsSideView(ex) ? t("sideViewHint") : "", ex.durationSec ? t("timedHint", { seconds: ex.durationSec }) : ""].filter(Boolean);
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
}
let pendingExercise: ExerciseDef | null = null;
let session: Session | null = null;
let landmarker: PoseLandmarkerLike | null = null;
let landmarkerLoading: Promise<PoseLandmarkerLike> | null = null;

async function localVendorAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${MP_LOCAL}/vision_bundle.mjs`, { method: "HEAD" });
    const type = res.headers.get("content-type") ?? "";
    return res.ok && !type.includes("text/html"); // السيرفر ممكن يرجّع index.html لأي مسار مش موجود
  } catch { return false; }
}

async function loadLandmarker(): Promise<PoseLandmarkerLike> {
  if (landmarker) return landmarker;
  landmarkerLoading ??= (async () => {
    const local = await localVendorAvailable();
    const base = local ? MP_LOCAL : MP_CDN;
    const model = local ? MP_LOCAL_MODEL : MP_CDN_MODEL;
    const mod = await import(/* @vite-ignore */ `${base}/vision_bundle.mjs`);
    const fileset = await mod.FilesetResolver.forVisionTasks(`${base}/wasm`);
    const make = (delegate: "GPU" | "CPU") =>
      mod.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: model, delegate },
        runningMode: "VIDEO",
        numPoses: 1,
      });
    try {
      landmarker = (await make("GPU")) as PoseLandmarkerLike;
    } catch {
      landmarker = (await make("CPU")) as PoseLandmarkerLike; // بعض الأجهزة مفيهاش GPU delegate
    }
    return landmarker;
  })();
  try {
    return await landmarkerLoading;
  } catch (err) {
    landmarkerLoading = null; // نسمح بإعادة المحاولة
    throw err;
  }
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
    smoother: createSmoother(5),
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
  if (startKey) speakExerciseCue(START_RECORDINGS[s.def.id], t(startKey), { interrupt: true });
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
  const lms = res.landmarks?.[0];
  const canvas = $<HTMLCanvasElement>("overlay");
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!lms) {
    s.lostFrames++;
    if (s.lostFrames > 10) s.smoother.reset();
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
      return inferenceDuration;
    }
    setStatus(framingMessage(framing));
    drawSkeleton(ctx, lms, framing === "ok" ? "#22c55e" : "#f59e0b");
    if (framing === "ok") {
      s.okSince ??= now;
      if (now - s.okSince > 1000) activate(s);
    } else {
      s.okSince = null;
    }
    return inferenceDuration;
  }

  const metrics = s.smoother.push(computeMetrics(lms, s.keys));
  const primary = metrics[s.def.primary];
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

function renderHud(): void {
  const s = session;
  if (!s) return;
  $("n-good").textContent = String(s.counter.state.goodReps);
  $("n-bad").textContent = String(s.counter.state.badReps);
  $("n-hold").textContent = String(Math.floor(s.counter.state.holdSeconds));
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
  if (active) store.addSession({ exerciseId: s.def.id, goodReps, badReps, holdSeconds: Math.round(holdSeconds), at: Date.now(), ...(s.pain ? { pain: true } : {}) });

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
    if (s.pain) lines.unshift(t("painStopped"), t("painAdvice"));
    if (s.def.durationSec) lines.unshift(t("timedResult", { count: goodReps + badReps, seconds: s.def.durationSec }));
    for (const l of lines) {
      const p = document.createElement("p");
      p.textContent = l;
      body.appendChild(p);
    }
    if (s.def.durationSec) { const note = document.createElement("p"); note.className = "hint"; note.textContent = t("timedResultNote"); body.appendChild(note); }
    const guides = s.def.mode === "reps" ? { up: s.def.inverted ? s.def.downBelow[settings.level] : s.def.upAbove[settings.level], down: s.def.inverted ? s.def.upAbove[settings.level] : s.def.downBelow[settings.level] } : {};
    const chart = renderTrace(s.trace, guides);
    if (chart) {
      const caption = document.createElement("p"); caption.className = "hint"; caption.textContent = t("traceCaption");
      chart.setAttribute("aria-label", t("traceCaption"));
      body.append(caption, chart);
    }
    if (!s.pain) renderRestTimer(body, () => { $("summary").hidden = true; openIntro(s.def); }, nextSetNumber(s.def.id));
    $("summary").hidden = false;
    speak(s.pain ? t("painStopped") : t("finishedWorkout"));
  } else {
    backToPicker();
  }
}

// تشغيل
initChrome();
window.addEventListener("healthmate:locale", () => {
  renderPicker();
  if (pendingExercise && !$<HTMLElement>("session").hidden) {
    renderIntro(pendingExercise);
  }
  if (session?.phase === "setup") setStatus(t("positionPhone"));
  else if (session?.phase === "active") setStatus(exerciseName(session.def.id));
});
renderPicker();
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
// الـ service worker بيتسجّل من vite-plugin-pwa (registerSW). هنا بس بنستقبل نقر الإشعار.
const requested = new URLSearchParams(location.search).get("tab");
if (requested && ["workout", "progress", "food", "medications", "assistant"].includes(requested)) window.dispatchEvent(new CustomEvent("healthmate:navigate", { detail: requested }));
navigator.serviceWorker?.addEventListener("message", (event) => {
  const data = event.data as { type?: string; tab?: string } | undefined;
  if (data?.type === "navigate" && data.tab) window.dispatchEvent(new CustomEvent("healthmate:navigate", { detail: data.tab }));
});
// لو المستخدم وافق قبل كده على المزامنة، نكمّلها تلقائي (من غير ما يفتح صفحة الحساب)
if (hasSupabaseConfig && localStorage.getItem("hm.cloud.consent")) void import("./cloud-sync.ts").then((m) => m.resumeCloudSync());
