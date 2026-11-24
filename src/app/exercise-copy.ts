// نصوص وأيقونات التمارين في مكان واحد (الاسم/الوصف/العضلات/نص البداية/رسائل التصحيح).
import { t } from "./i18n.ts";

type Key = Parameters<typeof t>[0];
interface Copy { name: Key; hint: Key; muscle: Key; start: Key; icon: string }

export const EXERCISE_COPY: Record<string, Copy> = {
  squat: { name: "squat", hint: "squatHint", muscle: "muscleLegsCore", start: "squatStart", icon: "M7 20h10M9 20l1-6 2-2 2 2 1 6M8 8a4 4 0 1 1 8 0" },
  pushup: { name: "pushup", hint: "pushupHint", muscle: "muscleChestArms", start: "pushupStart", icon: "M3 16h18M6 16l3-5 4-2 5 3M8 19h.01M18 19h.01" },
  plank: { name: "plank", hint: "plankHint", muscle: "muscleCore", start: "plankStart", icon: "M3 15h18M5 15l3-4h8l3 4M7 19v-4M17 19v-4" },
  lunge: { name: "lunge", hint: "lungeHint", muscle: "muscleLegsGlutes", start: "lungeStart", icon: "M10 4a2 2 0 1 0 0 .01M10 7v6l5 2 1 5M10 13l-4 3-2 4" },
  glute_bridge: { name: "gluteBridge", hint: "gluteBridgeHint", muscle: "muscleGlutesCore", start: "bridgeStart", icon: "M3 19h18M5 17l5-5 5 0 4 5M8 17v2M17 17v2" },
  wall_sit: { name: "wallSit", hint: "wallSitHint", muscle: "muscleLegs", start: "wallSitStart", icon: "M5 3v18M5 7h4v6h6v6M9 7a2 2 0 1 0 0 .01" },
  sit_to_stand: { name: "sitToStand", hint: "sitToStandHint", muscle: "muscleLegs", start: "sitToStandStart", icon: "M6 10v10M6 14h6v6M9 4a2 2 0 1 0 0 .01M12 8v6l5 2" },
};

export function exerciseName(id: string): string {
  const copy = EXERCISE_COPY[id];
  return copy ? t(copy.name) : id;
}

const CUE_KEYS: Record<string, Key> = {
  depth: "squatDepth", back: "backTilt", line: "pushupLine", sag: "plankSag", pike: "plankPike",
  lungeDepth: "lungeDepth", bridgeLift: "bridgeLift", wallHigh: "wallHigh", wallLow: "wallLow", wallBack: "wallBack", sitDepth: "sitDepth",
};

/** نص رسالة التصحيح. لو الـ cue مش معروف نرجع لنص بداية التمرين بدل رسالة غلط من تمرين تاني. */
export function cueText(exerciseId: string, cueId: string): string {
  const key = CUE_KEYS[cueId] ?? EXERCISE_COPY[exerciseId]?.start;
  return key ? t(key) : "";
}
