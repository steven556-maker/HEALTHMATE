import type { ExerciseDef } from "./types.ts";

// لانج: التصوير من الجنب. زاوية الركبة هنا متوسط الرجلين المرئيتين، فالحدود أوسع من السكوات.
export const lunge: ExerciseDef = {
  id: "lunge",
  name: "لانج",
  mode: "reps",
  primary: "knee",
  upAbove: { normal: 160, easy: 150 },
  downBelow: { normal: 125, easy: 135 },
  requires: ["knee"],
  checks: [
    {
      id: "lungeDepth",
      when: "bottom",
      needs: ["knee"],
      test: (m, level) => (m.knee ?? 180) < (level === "easy" ? 120 : 110),
      msg: "انزل أكتر شوية",
    },
    {
      id: "back",
      when: "any",
      needs: ["torso"],
      test: (m, level) => (m.torso ?? 0) < (level === "easy" ? 35 : 25),
      msg: "ضهرك مايل، اعدله",
    },
  ],
  cues: {
    start: "ابدأ اللانج. انزل واطلع براحة",
    goodRep: "برافو، تكرار ممتاز",
    badRep: "التكرار ده مش مظبوط، ركّز على الشكل",
  },
};
