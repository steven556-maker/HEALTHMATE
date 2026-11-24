import type { ExerciseDef } from "./types.ts";

// جسر الأرداف: بتتمدد على ضهرك والتصوير من الجنب. زاوية الورك (كتف-ورك-ركبة) ~130° في الراحة و~170° لما ترفع.
// inverted: الراحة = زاوية صغيرة (downBelow) والذروة = زاوية كبيرة (upAbove).
export const gluteBridge: ExerciseDef = {
  id: "glute_bridge",
  name: "جسر الأرداف",
  mode: "reps",
  primary: "hip",
  inverted: true,
  upAbove: { normal: 160, easy: 150 },
  downBelow: { normal: 145, easy: 140 },
  requires: ["hip"],
  checks: [
    {
      id: "bridgeLift",
      when: "bottom", // "bottom" = أقصى نقطة في التكرار، وهي هنا ذروة الرفع
      needs: ["hip"],
      test: (m, level) => (m.hip ?? 0) >= (level === "easy" ? 158 : 168),
      msg: "ارفع حوضك أكتر لحد ما يبقى جسمك على خط مستقيم",
    },
  ],
  cues: {
    start: "اتمدد على ضهرك وثني ركبتك. ارفع حوضك واثبت لحظة وانزل",
    goodRep: "ممتاز، تكرار مظبوط",
    badRep: "ارفع حوضك أكتر في التكرار الجاي",
  },
};
