import type { ExerciseDef } from "./types.ts";

// اختبار الوقوف من الجلوس (30 ثانية): عدد مرات الوقوف الكامل من الكرسي في 30 ثانية.
// التطبيق بيسجّل العدد بس ومبيفسّرش النتيجة طبيًا. شارك الرقم مع الطبيب أو أخصائي العلاج الطبيعي.
export const sitToStand: ExerciseDef = {
  id: "sit_to_stand",
  name: "الوقوف من الكرسي",
  mode: "reps",
  primary: "knee",
  durationSec: 30,
  upAbove: { normal: 160, easy: 150 },
  downBelow: { normal: 110, easy: 120 },
  requires: ["knee"],
  checks: [
    {
      id: "sitDepth",
      when: "bottom",
      needs: ["knee"],
      test: (m, level) => (m.knee ?? 180) < (level === "easy" ? 112 : 102),
      msg: "اقعد على الكرسي كويس",
    },
  ],
  cues: {
    start: "ابدأ واقف قدام الكرسي. اقعد وقف أكتر عدد تقدر عليه في 30 ثانية",
    goodRep: "برافو",
    badRep: "اقعد على الكرسي كويس",
  },
};
