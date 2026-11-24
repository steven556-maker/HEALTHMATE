import type { ExerciseDef } from "./types.ts";

// بلانك: تمرين ثبات. الوقت يُحسب فقط وقت ما الوضعية سليمة.
// hipDrop موجب = الورك نازل (هبوط)، سالب = الورك مرفوع.
export const plank: ExerciseDef = {
  id: "plank",
  name: "بلانك",
  mode: "hold",
  primary: "hipDrop",
  upAbove: { normal: 0, easy: 0 },
  downBelow: { normal: 0, easy: 0 },
  requires: ["hipDrop"],
  checks: [
    {
      id: "sag",
      when: "hold",
      needs: ["hipDrop"],
      test: (m, level) => (m.hipDrop ?? 0) < (level === "easy" ? 0.09 : 0.06),
      msg: "ارفع وسطك شوية",
    },
    {
      id: "pike",
      when: "hold",
      needs: ["hipDrop"],
      test: (m, level) => (m.hipDrop ?? 0) > -(level === "easy" ? 0.09 : 0.06),
      msg: "نزّل وسطك على خط مستقيم",
    },
  ],
  cues: {
    start: "اثبت في وضع البلانك",
    goodRep: "",
    badRep: "",
    holdMilestone: "ممتاز، كمّل ثبات",
  },
};
