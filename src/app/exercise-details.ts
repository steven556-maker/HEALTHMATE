
import { getLocale } from "./i18n.ts";
import { beep, speak, unlockAudio } from "./voice.ts";

interface Detail { steps: [string, string][]; mistake: [string, string] }

const DETAILS: Record<string, Detail> = {
  squat: {
    steps: [["قف والقدمين بعرض الكتفين.", "Stand with feet shoulder-width apart."], ["انزل بالورك للخلف كأنك هتقعد على كرسي.", "Sit your hips back as if sitting on a chair."], ["ارجع لفوق وأنت بتدفع بكعب القدم.", "Push through your heels to stand back up."]],
    mistake: ["الضهر بينحني لقدّام أو الركبة بتدخل لجوّه.", "Back rounds forward or knees cave inward."],
  },
  pushup: {
    steps: [["ابدأ بوضع بلانك واليدين تحت الكتفين.", "Start in a plank with hands under shoulders."], ["انزل بصدرك لحد ما الكوع يعمل زاوية تقريبًا قائمة.", "Lower your chest until elbows reach about 90 degrees."], ["ادفع الأرض لفوق وجسمك خط مستقيم.", "Push up keeping your body in one straight line."]],
    mistake: ["الوسط بينزل أو الورك بيرتفع.", "Hips sag or pike up."],
  },
  plank: {
    steps: [["استند على الساعدين والكوع تحت الكتف.", "Rest on forearms with elbows under shoulders."], ["شد البطن وخلّي الجسم خط مستقيم من الرأس للكعب.", "Brace your core, body straight from head to heels."], ["كمّل تنفس عادي وماتحبسش نفسك.", "Keep breathing normally."]],
    mistake: ["نزول الوسط أو رفع الورك.", "Lower back sagging or hips too high."],
  },
  lunge: {
    steps: [["قف وخد خطوة واسعة لقدّام.", "Stand and take a long step forward."], ["انزل لحد ما الركبتين الاتنين تقاربوا زاوية قائمة.", "Lower until both knees are near 90 degrees."], ["ادفع بالرجل الأمامية وارجع.", "Push off the front leg to return."]],
    mistake: ["الركبة الأمامية بتعدّي مشط القدم بكتير.", "Front knee travels far past the toes."],
  },
  glute_bridge: {
    steps: [["نام على ضهرك والركبتين مثنيّتين والقدمين على الأرض.", "Lie on your back, knees bent, feet flat."], ["ارفع الورك لحد ما الجسم يبقى خط من الكتف للركبة.", "Lift hips until shoulders, hips and knees line up."], ["انزل ببطء وكرر.", "Lower slowly and repeat."]],
    mistake: ["تقويس أسفل الضهر بدل شد الأرداف.", "Arching the lower back instead of squeezing the glutes."],
  },
  wall_sit: {
    steps: [["استند بضهرك على الحيطة.", "Lean your back against a wall."], ["انزل لحد ما الركبتين زاوية قائمة والفخذ موازي للأرض.", "Slide down until knees are 90 degrees, thighs parallel to floor."], ["ثبّت الوضع واحسب الثواني.", "Hold the position and count the seconds."]],
    mistake: ["الركبة قدّام القدم أو الجلسة عالية أوي.", "Knees past the feet or sitting too high."],
  },
  sit_to_stand: {
    steps: [["اقعد على حافة كرسي ثابت والقدمين على الأرض.", "Sit at the edge of a stable chair, feet on the floor."], ["قف بالكامل من غير ما تسند بإيديك لو تقدر.", "Stand up fully, without using your hands if you can."], ["اقعد ببطء وكرر.", "Sit back down slowly and repeat."]],
    mistake: ["الاندفاع لقدّام أو الارتماء على الكرسي.", "Rushing forward or dropping into the chair."],
  },
};

const L = {
  steps: ["الخطوات", "Steps"],
  mistake: ["غلطة شائعة", "Common mistake"],
  setLabel: ["المجموعة", "Set"],
  rest: ["وقت الراحة", "Rest timer"],
  skip: ["تخطي", "Skip"],
  restDone: ["الراحة خلصت. جاهز؟", "Rest is over. Ready?"],
  another: ["مجموعة تانية", "Another set"],
  restHint: ["اختار مدة الراحة بين المجموعات.", "Pick a rest time between sets."],
  stopPain: ["لو حسّيت بألم حاد، وقّف.", "Stop if you feel sharp pain."],
};
const tr = (k: keyof typeof L): string => L[k][getLocale() === "en" ? 1 : 0];

export function renderExerciseDetails(id: string, host: HTMLElement): void {
  host.replaceChildren();
  const d = DETAILS[id];
  if (!d) return;
  const en = getLocale() === "en" ? 1 : 0;
  const h = document.createElement("h3"); h.textContent = tr("steps");
  const ol = document.createElement("ol"); ol.className = "detail-steps";
  for (const s of d.steps) { const li = document.createElement("li"); li.textContent = s[en]; ol.append(li); }
  const m = document.createElement("p"); m.className = "detail-mistake";
  const b = document.createElement("b"); b.textContent = `${tr("mistake")}: `;
  m.append(b, d.mistake[en]);
  const warn = document.createElement("p"); warn.className = "hint"; warn.textContent = tr("stopPain");
  host.append(h, ol, m, warn);
}

// عدّاد المجموعات: في الذاكرة بس، بيتصفّر لما الصفحة تتقفل.
const sets = new Map<string, number>();
export function nextSetNumber(id: string): number {
  const n = (sets.get(id) ?? 0) + 1;
  sets.set(id, n);
  return n;
}
export function currentSet(id: string): number { return sets.get(id) ?? 0; }

let timerId: number | undefined;
export function stopRestTimer(): void { if (timerId !== undefined) { clearInterval(timerId); timerId = undefined; } }

export function renderRestTimer(host: HTMLElement, onAnother: () => void, setNo: number): void {
  stopRestTimer();
  const box = document.createElement("div"); box.className = "rest-box";
  const title = document.createElement("h3"); title.textContent = `${tr("setLabel")} ${setNo} · ${tr("rest")}`;
  const hint = document.createElement("p"); hint.className = "hint"; hint.textContent = tr("restHint");
  const row = document.createElement("div"); row.className = "rest-row";
  const clock = document.createElement("p"); clock.className = "rest-clock"; clock.setAttribute("role", "timer"); clock.hidden = true;
  const live = document.createElement("p"); live.className = "hint"; live.setAttribute("aria-live", "polite");
  const start = (sec: number): void => {
    stopRestTimer();
    let left = sec;
    unlockAudio();
    clock.hidden = false; live.textContent = "";
    clock.textContent = String(left);
    timerId = window.setInterval(() => {
      left -= 1;
      clock.textContent = String(Math.max(0, left));
      if (left > 0 && left <= 3) { if (!beep(660, 120)) speak(String(left), { interrupt: true }); }
      if (left <= 0) {
        stopRestTimer();
        live.textContent = tr("restDone");
        if (!beep(990, 350)) speak(tr("restDone"), { interrupt: true });
        try { navigator.vibrate?.(200); } catch { /* مش كل الأجهزة بتدعم الاهتزاز */ }
      }
    }, 1000);
  };
  for (const sec of [30, 60, 90]) {
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "btn"; btn.textContent = `${sec}s`;
    btn.onclick = () => start(sec); row.append(btn);
  }
  const skip = document.createElement("button"); skip.type = "button"; skip.className = "btn"; skip.textContent = tr("skip");
  skip.onclick = () => { stopRestTimer(); clock.hidden = true; live.textContent = ""; };
  row.append(skip);
  const another = document.createElement("button"); another.type = "button"; another.className = "btn primary"; another.textContent = tr("another");
  another.onclick = () => { stopRestTimer(); onAnother(); };
  box.append(title, hint, row, clock, live, another);
  host.append(box);
}
