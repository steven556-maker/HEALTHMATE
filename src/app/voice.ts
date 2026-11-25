// تنبيهات صوتية بالعامية المصرية عبر Web Speech API (على الجهاز)
import { getLocale } from "./i18n.ts";
import { AudioCoordinator, type CueAction } from "./audio-coordinator.ts";

let voices: SpeechSynthesisVoice[] = [];
let muted = false;
const coordinator = new AudioCoordinator();
let recordedCue: HTMLAudioElement | null = null;

function pickVoice(): void {
  if (!("speechSynthesis" in window)) return;
  const all = speechSynthesis.getVoices();
  voices = all;
}

export function initVoice(): void {
  if (!("speechSynthesis" in window)) return;
  pickVoice();
  speechSynthesis.addEventListener("voiceschanged", pickVoice);
  // iOS Safari: الأصوات بتتحمّل متأخر وساعات voiceschanged مبتتطلقش، فنعيد المحاولة.
  let tries = 0;
  const retry = window.setInterval(() => { pickVoice(); if (voices.length > 0 || ++tries > 10) clearInterval(retry); }, 500);
  // iOS بيمنع أي صوت قبل لمسة من المستخدم. أول لمسة تفتح الصوت.
  const unlockOnce = () => { unlockAudio(); window.removeEventListener("pointerdown", unlockOnce); window.removeEventListener("touchend", unlockOnce); };
  window.addEventListener("pointerdown", unlockOnce, { passive: true });
  window.addEventListener("touchend", unlockOnce, { passive: true });
}

// 100 مللي ثانية صمت (WAV) عشان نفتح عنصر الصوت جوه لمسة المستخدم.
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
let unlocked = false;
let audioCtx: AudioContext | null = null;
/** لازم تتنادى جوه معالج لمسة/ضغطة. على iOS Safari بتفتح speechSynthesis وعنصر Audio وWebAudio، وبتخلي الصوت يشتغل حتى لو مفتاح الصامت مقفول (لو الجهاز بيدعم audioSession). */
export function unlockAudio(): void {
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = "playback";
  } catch { /* مش كل المتصفحات */ }
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) { audioCtx ??= new Ctx(); void audioCtx.resume(); }
  } catch { /* تجاهل */ }
  if (unlocked) return;
  try {
    recordedCue ??= new Audio();
    recordedCue.src = SILENT_WAV;
    void recordedCue.play().then(() => { recordedCue?.pause(); }).catch(() => undefined);
  } catch { /* تجاهل */ }
  try {
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      speechSynthesis.speak(u);
      pickVoice();
    }
  } catch { /* تجاهل */ }
  unlocked = true;
}

/** صوت بيب قصير (للمؤقت). بيرجّع false لو WebAudio مش متاح أو لسه مقفول. */
export function beep(freq = 880, ms = 150): boolean {
  if (muted || !audioCtx || audioCtx.state !== "running") return false;
  const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
  o.frequency.value = freq; g.gain.value = 0.2;
  o.connect(g); g.connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + ms / 1000);
  return true;
}

export function setMuted(m: boolean): void {
  muted = m;
  coordinator.setMuted(m);
  if (m) stopOutputs();
}

function stopOutputs(): void {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  if (recordedCue) {
    recordedCue.pause();
    recordedCue.currentTime = 0;
  }
}

function speechAction(text: string): CueAction {
  return (done) => {
    if (!canSpeakCurrentLocale()) { done(); return () => undefined; }
    const u = new SpeechSynthesisUtterance(text);
    const locale = getLocale();
    const voice = locale === "ar"
      ? voices.find((item) => item.lang.toLowerCase().replace("_", "-") === "ar-eg") ?? voices.find((item) => item.lang.toLowerCase().startsWith("ar"))
      : voices.find((item) => item.lang.toLowerCase().startsWith("en-us")) ?? voices.find((item) => item.lang.toLowerCase().startsWith("en"));
    u.lang = voice?.lang ?? (locale === "ar" ? "ar-EG" : "en-US");
    if (voice) u.voice = voice;
    u.rate = 0.95;
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
    return () => { u.onend = null; u.onerror = null; speechSynthesis.cancel(); };
  };
}

/** Play an included ElevenLabs workout cue. */
export function playRecordedCue(index: number, fallbackText = "", opts: { interrupt?: boolean } = {}): void {
  if (muted || !Number.isInteger(index) || index < 1 || index > 20) return;
  const base = import.meta.env.BASE_URL;
  coordinator.enqueue((done) => {
    recordedCue ??= new Audio();
    recordedCue.pause();
    recordedCue.src = `${base}audio/recording-${String(index).padStart(2, "0")}.mp3`;
    recordedCue.currentTime = 0;
    let finished = false;
    let fallbackStarted = false;
    let cancelCurrent = () => { recordedCue?.pause(); };
    const finish = () => {
      if (finished) return;
      finished = true;
      recordedCue?.removeEventListener("ended", finish);
      recordedCue?.removeEventListener("error", onError);
      done();
    };
    const onError = () => {
      if (fallbackStarted || finished) return;
      fallbackStarted = true;
      if (!fallbackText) { finish(); return; }
      const cancelSpeech = speechAction(fallbackText)(finish);
      cancelCurrent = () => { recordedCue?.pause(); cancelSpeech(); };
    };
    recordedCue.addEventListener("ended", finish, { once: true });
    recordedCue.addEventListener("error", onError, { once: true });
    void recordedCue.play().catch(onError);
    return () => {
      recordedCue?.removeEventListener("ended", finish);
      recordedCue?.removeEventListener("error", onError);
      cancelCurrent();
      finished = true;
    };
  }, opts.interrupt);
}

export function hasArabicVoice(): boolean {
  if (voices.length === 0) pickVoice();
  return voices.some((voice) => voice.lang.toLowerCase().startsWith("ar"));
}

/** هل في صوت للغة الحالية؟ كتير من أجهزة أندرويد مفيهاش صوت عربي. لو مفيش، الواجهة لازم تعرض التنبيه نصًا. */
export function canSpeakCurrentLocale(): boolean {
  if (!("speechSynthesis" in window)) return false;
  return getLocale() === "ar" ? hasArabicVoice() : true;
}

/** بيرجّع true لو الكلام اتنطق فعلًا. false = مكتوم أو مفيش صوت أو في جملة شغالة، فالمُنادي يعرض النص بدلها. */
export function speak(text: string, opts: { interrupt?: boolean } = {}): boolean {
  if (muted || !text) return false;
  if (!canSpeakCurrentLocale()) {
    if (opts.interrupt) coordinator.stop();
    return false;
  }
  return coordinator.enqueue(speechAction(text), opts.interrupt);
}
