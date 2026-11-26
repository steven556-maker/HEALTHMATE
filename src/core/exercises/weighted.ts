import type { ExerciseDef } from "./types.ts";
import { squat } from "./squat.ts";

// تمارين بأوزان. الكاميرا بتعدّ التكرارات وبتصحح الشكل بس، مابتعرفش الوزن
// الحدود تقريبية. البايسبس اتظبط على فيديو حقيقي واحد (الكوع بيوصل حوالي 85-110 في أعلى نقطة، مش أقل)

// سكوات بدمبل: نفس السكوات العادي بس بوزن
export const gobletSquat: ExerciseDef = {
  ...squat,
  id: "goblet_squat",
  name: "سكوات بدمبل",
  weighted: true,
  cues: { start: "امسك الدمبل قدام صدرك وانزل كأنك هتقعد", goodRep: "عاش، سكوات ممتاز", badRep: "السكوات ده مش مظبوط، ركّز على الشكل" },
};

// بايسبس: كل دراع بتتعدّ لوحدها، فالاتنين مع بعض أو بالتبادل أو دراع واحدة كله شغال
export const bicepsCurl: ExerciseDef = {
  id: "biceps_curl",
  name: "بايسبس بدمبل",
  mode: "reps",
  primary: "elbow",
  upAbove: { normal: 140, easy: 130 },
  downBelow: { normal: 105, easy: 115 },
  requires: ["elbow"],
  view: "any",
  perSide: true,
  weighted: true,
  checks: [
    {
      id: "curlTop",
      when: "bottom",
      needs: ["elbow"],
      test: (m, level) => (m.elbow ?? 180) < (level === "easy" ? 110 : 100),
      msg: "اطلع بالدمبل أعلى لحد كتفك",
    },
  ],
  cues: {
    start: "امسك الدمبلين ودراعاتك نازلة، اطلع بالاتنين مع بعض أو بالتبادل",
    goodRep: "ممتاز، تكرار مظبوط",
    badRep: "اطلع بالدمبل أعلى وانزل لحد ما دراعك تتفرد",
  },
};

// ضغط الكتف (من الأمام): الراحة الكوع مثني والذروة الدراع مفرود
export const shoulderPress: ExerciseDef = {
  id: "shoulder_press",
  name: "ضغط كتف بدمبل",
  mode: "reps",
  primary: "elbow",
  inverted: true,
  upAbove: { normal: 160, easy: 150 },
  downBelow: { normal: 110, easy: 120 },
  requires: ["elbow"],
  view: "any",
  perSide: true,
  weighted: true,
  checks: [
    {
      id: "pressTop",
      when: "bottom", // أقصى نقطة في التكرار = الذروة
      needs: ["elbow"],
      test: (m, level) => (m.elbow ?? 0) >= (level === "easy" ? 155 : 165),
      msg: "افرد دراعك لفوق بالكامل",
    },
  ],
  cues: {
    start: "امسك الدمبلين عند كتفك وادفعهم لفوق لحد ما دراعك تتفرد",
    goodRep: "ممتاز، ضغطة كاملة",
    badRep: "افرد دراعك لفوق أكتر",
  },
};

// رفرفة جانبية (من الأمام): زاوية ورك-كتف-كوع، حوالي 15 نازلة و90 عند الكتف
export const lateralRaise: ExerciseDef = {
  id: "lateral_raise",
  name: "رفرفة جانبية بدمبل",
  mode: "reps",
  primary: "shoulder",
  inverted: true,
  upAbove: { normal: 75, easy: 65 },
  downBelow: { normal: 35, easy: 40 },
  requires: ["shoulder"],
  view: "any",
  perSide: true,
  weighted: true,
  checks: [
    {
      id: "raiseHigh",
      when: "bottom",
      needs: ["shoulder"],
      test: (m, level) => (m.shoulder ?? 0) >= (level === "easy" ? 70 : 80),
      msg: "ارفع دراعك لحد مستوى كتفك",
    },
    {
      id: "raiseLow",
      when: "bottom",
      needs: ["shoulder"],
      test: (m) => (m.shoulder ?? 0) <= 115,
      msg: "ما تعدّيش مستوى الكتف",
    },
  ],
  cues: {
    start: "امسك الدمبلين جنبك وارفع دراعاتك للجنبين لحد مستوى الكتف",
    goodRep: "ممتاز، رفعة مظبوطة",
    badRep: "ارفع لحد مستوى الكتف بس",
  },
};

// ديدليفت روماني (من الجنب): الورك حوالي 175 واقف وحوالي 100 وإنت مايل
export const romanianDeadlift: ExerciseDef = {
  id: "romanian_deadlift",
  name: "ديدليفت روماني",
  mode: "reps",
  primary: "hip",
  upAbove: { normal: 165, easy: 160 },
  downBelow: { normal: 130, easy: 140 },
  requires: ["hip", "knee"],
  weighted: true,
  checks: [
    {
      id: "hingeDepth",
      when: "bottom",
      needs: ["hip"],
      test: (m, level) => (m.hip ?? 180) < (level === "easy" ? 125 : 115),
      msg: "اثني من الورك أكتر وضهرك مستقيم",
    },
    {
      id: "kneesLocked",
      when: "any",
      needs: ["knee"],
      test: (m, level) => (m.knee ?? 180) >= (level === "easy" ? 135 : 145),
      msg: "خلّي ركبتك شبه مفرودة، الحركة من الورك",
    },
  ],
  cues: {
    start: "امسك الدمبلين قدام فخذك، اثني من الورك وضهرك مستقيم وانزل لحد ركبتك",
    goodRep: "ممتاز، حركة ورك مظبوطة",
    badRep: "اثني من الورك أكتر وخلّي ركبتك شبه مفرودة",
  },
};

export const WEIGHTED: ExerciseDef[] = [gobletSquat, bicepsCurl, shoulderPress, lateralRaise, romanianDeadlift];
