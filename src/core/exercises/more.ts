import type { ExerciseDef } from "./types.ts";

// تمارين بوزن الجسم الجديدة (من الجنب). الحدود تقريبية ومش متجربة على كاميرا حقيقية

export const highKnees: ExerciseDef = {
  id: "high_knees",
  name: "رفع الركبة",
  mode: "reps",
  primary: "hip",
  upAbove: { normal: 158, easy: 150 },
  downBelow: { normal: 142, easy: 146 },
  requires: ["hip"],
  checks: [
    {
      id: "kneeHigh",
      when: "bottom",
      needs: ["hip"],
      test: (m, level) => (m.hip ?? 180) < (level === "easy" ? 146 : 138),
      msg: "ارفع ركبتك أعلى",
    },
  ],
  cues: {
    start: "قف مستقيم وارفع ركبتك لحد وسطك واحدة واحدة",
    goodRep: "ممتاز، كمّل",
    badRep: "ارفع ركبتك أعلى في المرة الجاية",
  },
};

export const mountainClimbers: ExerciseDef = {
  id: "mountain_climbers",
  name: "متسلق الجبال",
  mode: "reps",
  primary: "hip",
  upAbove: { normal: 158, easy: 150 },
  downBelow: { normal: 142, easy: 146 },
  requires: ["hip"],
  checks: [
    {
      id: "driveKnee",
      when: "bottom",
      needs: ["hip"],
      test: (m, level) => (m.hip ?? 180) < (level === "easy" ? 146 : 138),
      msg: "شد ركبتك ناحية صدرك أكتر",
    },
  ],
  cues: {
    start: "خد وضع الضغط وشد ركبتك ناحية صدرك واحدة واحدة",
    goodRep: "تمام، كمّل",
    badRep: "شد ركبتك أقرب لصدرك",
  },
};

// رفع الأرجل: الورك حوالي 175 والرجلين على الأرض، وحوالي 95 لما ترفعهم
export const legRaise: ExerciseDef = {
  id: "leg_raise",
  name: "رفع الأرجل",
  mode: "reps",
  primary: "hip",
  upAbove: { normal: 160, easy: 150 },
  downBelow: { normal: 130, easy: 140 },
  requires: ["hip", "knee"],
  checks: [
    {
      id: "legHigh",
      when: "bottom",
      needs: ["hip"],
      test: (m, level) => (m.hip ?? 180) < (level === "easy" ? 115 : 105),
      msg: "ارفع رجليك أعلى",
    },
    {
      id: "legStraight",
      when: "any",
      needs: ["knee"],
      test: (m, level) => (m.knee ?? 180) >= (level === "easy" ? 140 : 150),
      msg: "خلّي رجليك مفرودة",
    },
  ],
  cues: {
    start: "اتمدد على ضهرك وارفع رجليك مفرودة وانزلهم ببطء",
    goodRep: "ممتاز، تكرار مظبوط",
    badRep: "ارفع رجليك أعلى وخليهم مفرودين",
  },
};
