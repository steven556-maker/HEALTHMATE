import type { ExerciseDef } from "./types.ts";

// جلسة الحيطة: تمرين ثبات. الوقت يتحسب بس وقت ما زاوية الركبة قريبة من 90° وضهرك على الحيطة.
export const wallSit: ExerciseDef = {
  id: "wall_sit",
  name: "جلسة الحيطة",
  mode: "hold",
  primary: "knee",
  upAbove: { normal: 0, easy: 0 },
  downBelow: { normal: 0, easy: 0 },
  requires: ["knee"],
  checks: [
    {
      id: "wallHigh",
      when: "hold",
      needs: ["knee"],
      test: (m, level) => (m.knee ?? 0) <= (level === "easy" ? 125 : 115),
      msg: "انزل لحد ما ركبتك تبقى زاوية قايمة",
    },
    {
      id: "wallLow",
      when: "hold",
      needs: ["knee"],
      test: (m, level) => (m.knee ?? 180) >= (level === "easy" ? 65 : 70),
      msg: "اطلع شوية، ركبتك نزلت أوي",
    },
    {
      id: "wallBack",
      when: "hold",
      needs: ["torso"],
      test: (m, level) => (m.torso ?? 0) <= (level === "easy" ? 30 : 20),
      msg: "حط ضهرك على الحيطة",
    },
  ],
  cues: {
    start: "ضهرك على الحيطة وانزل لحد ما ركبتك تبقى زاوية قايمة، وثبت",
    goodRep: "",
    badRep: "",
    holdMilestone: "ممتاز، كمّل ثبات",
  },
};
