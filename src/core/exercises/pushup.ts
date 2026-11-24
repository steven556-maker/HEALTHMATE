import type { ExerciseDef } from "./types.ts";

// ضغط: الزاوية الأساسية = الكوع. لازم التصوير من الجنب والجسم كله في الكادر.
export const pushup: ExerciseDef = {
  id: "pushup",
  name: "ضغط",
  mode: "reps",
  primary: "elbow",
  upAbove: { normal: 150, easy: 140 },
  downBelow: { normal: 110, easy: 120 },
  requires: ["elbow", "bodyLine"],
  checks: [
    {
      id: "depth",
      when: "bottom",
      needs: ["elbow"],
      test: (m, level) => (m.elbow ?? 180) < (level === "easy" ? 105 : 90),
      msg: "انزل أكتر شوية",
    },
    {
      id: "line",
      when: "any",
      needs: ["bodyLine"],
      test: (m, level) => (m.bodyLine ?? 180) >= (level === "easy" ? 150 : 160),
      msg: "اشدّ جسمك على خط مستقيم",
    },
  ],
  cues: {
    start: "ابدأ الضغط. حافظ على جسمك مستقيم",
    goodRep: "عاش، ضغطة ممتازة",
    badRep: "الضغطة دي مش مظبوطة، ركّز على الشكل",
  },
};
