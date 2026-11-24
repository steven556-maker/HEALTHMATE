import type { ExerciseDef } from "./types.ts";

// سكوات: الزاوية الأساسية = الركبة. التصوير الأفضل من الجنب.
export const squat: ExerciseDef = {
  id: "squat",
  name: "سكوات",
  mode: "reps",
  primary: "knee",
  upAbove: { normal: 160, easy: 150 },
  downBelow: { normal: 110, easy: 125 },
  requires: ["knee"],
  checks: [
    {
      id: "depth",
      when: "bottom",
      needs: ["knee"],
      test: (m, level) => (m.knee ?? 180) < (level === "easy" ? 110 : 95),
      msg: "انزل أكتر شوية",
    },
    {
      id: "back",
      when: "any",
      needs: ["torso"],
      test: (m, level) => (m.torso ?? 0) < (level === "easy" ? 60 : 50),
      msg: "ضهرك مايل، اعدله",
    },
  ],
  cues: {
    start: "ابدأ السكوات. انزل واطلع براحة",
    goodRep: "برافو، تكرار ممتاز",
    badRep: "التكرار ده مش مظبوط، ركّز على الشكل",
  },
};
