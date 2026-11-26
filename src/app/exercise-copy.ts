// نصوص وأيقونات التمارين في مكان واحد (الاسم/الوصف/العضلات/نص البداية/رسائل التصحيح).
import { getLocale, t } from "./i18n.ts";

type Key = Parameters<typeof t>[0];
// مفتاح ترجمة أو زوج [عربي، إنجليزي]
export type CopyText = Key | readonly [string, string];
interface Copy { name: CopyText; hint: CopyText; muscle: CopyText; start: CopyText; icon: string }

export function copyText(v: CopyText): string {
  return typeof v === "string" ? t(v) : v[getLocale() === "en" ? 1 : 0];
}

export const EXERCISE_COPY: Record<string, Copy> = {
  squat: { name: "squat", hint: "squatHint", muscle: "muscleLegsCore", start: "squatStart", icon: "M7 20h10M9 20l1-6 2-2 2 2 1 6M8 8a4 4 0 1 1 8 0" },
  pushup: { name: "pushup", hint: "pushupHint", muscle: "muscleChestArms", start: "pushupStart", icon: "M3 16h18M6 16l3-5 4-2 5 3M8 19h.01M18 19h.01" },
  plank: { name: "plank", hint: "plankHint", muscle: "muscleCore", start: "plankStart", icon: "M3 15h18M5 15l3-4h8l3 4M7 19v-4M17 19v-4" },
  lunge: { name: "lunge", hint: "lungeHint", muscle: "muscleLegsGlutes", start: "lungeStart", icon: "M10 4a2 2 0 1 0 0 .01M10 7v6l5 2 1 5M10 13l-4 3-2 4" },
  glute_bridge: { name: "gluteBridge", hint: "gluteBridgeHint", muscle: "muscleGlutesCore", start: "bridgeStart", icon: "M3 19h18M5 17l5-5 5 0 4 5M8 17v2M17 17v2" },
  wall_sit: { name: "wallSit", hint: "wallSitHint", muscle: "muscleLegs", start: "wallSitStart", icon: "M5 3v18M5 7h4v6h6v6M9 7a2 2 0 1 0 0 .01" },
  sit_to_stand: { name: "sitToStand", hint: "sitToStandHint", muscle: "muscleLegs", start: "sitToStandStart", icon: "M6 10v10M6 14h6v6M9 4a2 2 0 1 0 0 .01M12 8v6l5 2" },
  high_knees: { name: ["رفع الركبة", "High knees"], hint: ["ارفع ركبتك لحد مستوى وسطك واحدة واحدة", "Lift each knee to hip height, alternating"], muscle: ["الأرجل والكارديو", "Legs and cardio"], start: ["قف مستقيم والتصوير من الجنب، وارفع ركبتك لحد وسطك", "Stand tall, filmed from the side, and lift each knee to hip height"], icon: "M10 4a2 2 0 1 0 0 .01M10 7v6l5 1v5M10 13l-3 7" },
  mountain_climbers: { name: ["متسلق الجبال", "Mountain climbers"], hint: ["من وضع الضغط شد ركبتك ناحية صدرك", "From a push-up position, drive a knee to your chest"], muscle: ["الكور والكارديو", "Core and cardio"], start: ["خد وضع الضغط والتصوير من الجنب، وشد ركبتك ناحية صدرك", "Take a push-up position, filmed from the side, and drive a knee to your chest"], icon: "M3 15h18M5 15l3-4h8l3 4M12 15l-3 3" },
  leg_raise: { name: ["رفع الأرجل", "Leg raise"], hint: ["نام على ضهرك وارفع رجليك مفرودة", "Lie on your back and raise straight legs"], muscle: ["البطن السفلي", "Lower abs"], start: ["اتمدد على ضهرك والتصوير من الجنب، وارفع رجليك مفرودة", "Lie on your back, filmed from the side, and raise straight legs"], icon: "M3 19h10M13 19l5-12" },
  goblet_squat: { name: ["سكوات بدمبل", "Goblet squat"], hint: ["سكوات وإنت ماسك وزن قدام صدرك", "Squat while holding a weight at your chest"], muscle: ["الأرجل والكور", "Legs and core"], start: ["امسك الدمبل قدام صدرك وانزل كأنك هتقعد", "Hold the dumbbell at your chest and sit back and down"], icon: "M7 20h10M9 20l1-6 2-2 2 2 1 6M8 8a4 4 0 1 1 8 0" },
  biceps_curl: { name: ["بايسبس بدمبل", "Biceps curl"], hint: ["اطلع بالدمبلين لكتفك وانزل ببطء", "Curl the dumbbells to your shoulders and lower slowly"], muscle: ["الدراعين", "Arms"], start: ["قف قدام الكاميرا ودراعاتك نازلة، واطلع بالدمبلين مع بعض", "Face the camera, arms down, and curl both dumbbells together"], icon: "M8 20v-7l4-4 4 2M16 11a2 2 0 1 0 0 .01" },
  shoulder_press: { name: ["ضغط كتف بدمبل", "Shoulder press"], hint: ["ادفع الدمبلين من كتفك لفوق", "Press dumbbells from shoulders overhead"], muscle: ["الكتف والدراعين", "Shoulders and arms"], start: ["قف قدام الكاميرا والدمبلين عند كتفك، وادفعهم لفوق", "Face the camera with dumbbells at your shoulders and press overhead"], icon: "M6 10V4M18 10V4M6 10h12M12 10v10" },
  lateral_raise: { name: ["رفرفة جانبية بدمبل", "Lateral raise"], hint: ["ارفع دراعاتك للجنبين لحد الكتف", "Raise your arms out to shoulder height"], muscle: ["الكتف", "Shoulders"], start: ["قف قدام الكاميرا ودراعاتك جنبك، وارفعهم للجنبين لحد الكتف", "Face the camera, arms at your sides, and raise them out to shoulder height"], icon: "M3 11h18M12 7v13M12 5a2 2 0 1 0 0 .01" },
  romanian_deadlift: { name: ["ديدليفت روماني", "Romanian deadlift"], hint: ["اثني من الورك وضهرك مستقيم", "Hinge at the hips with a flat back"], muscle: ["الضهر السفلي والفخذ الخلفي", "Lower back and hamstrings"], start: ["قف والتصوير من الجنب والدمبلين قدام فخذك، واثني من الورك", "Stand, filmed from the side, dumbbells at your thighs, and hinge at the hips"], icon: "M12 4a2 2 0 1 0 0 .01M12 7l5 5-5 2v6" },
};

export function exerciseName(id: string): string {
  const copy = EXERCISE_COPY[id];
  return copy ? copyText(copy.name) : id;
}

const CUE_KEYS: Record<string, Key> = {
  depth: "squatDepth", back: "backTilt", line: "pushupLine", sag: "plankSag", pike: "plankPike",
  lungeDepth: "lungeDepth", bridgeLift: "bridgeLift", wallHigh: "wallHigh", wallLow: "wallLow", wallBack: "wallBack", sitDepth: "sitDepth",
};

// رسائل التصحيح للتمارين الجديدة
const EXTRA_CUES: Record<string, readonly [string, string]> = {
  kneeHigh: ["ارفع ركبتك أعلى", "Lift your knee higher"],
  driveKnee: ["شد ركبتك ناحية صدرك أكتر", "Drive your knee closer to your chest"],
  legHigh: ["ارفع رجليك أعلى", "Raise your legs higher"],
  legStraight: ["خلّي رجليك مفرودة", "Keep your legs straight"],
  curlTop: ["اطلع بالدمبل أعلى لحد كتفك", "Curl the dumbbell higher, up to your shoulder"],
  pressTop: ["افرد دراعك لفوق بالكامل", "Fully straighten your arms overhead"],
  raiseHigh: ["ارفع دراعك لحد مستوى كتفك", "Raise your arms to shoulder height"],
  raiseLow: ["ما تعدّيش مستوى الكتف", "Do not go above shoulder height"],
  hingeDepth: ["اثني من الورك أكتر وضهرك مستقيم", "Hinge more at the hips, back flat"],
  kneesLocked: ["خلّي ركبتك شبه مفرودة، الحركة من الورك", "Keep your knees nearly straight, move from the hips"],
};

/** نص رسالة التصحيح. لو الـ cue مش معروف نرجع لنص بداية التمرين بدل رسالة غلط من تمرين تاني. */
export function cueText(exerciseId: string, cueId: string): string {
  const key = CUE_KEYS[cueId];
  if (key) return t(key);
  const extra = EXTRA_CUES[cueId];
  if (extra) return copyText(extra);
  const start = EXERCISE_COPY[exerciseId]?.start;
  return start ? copyText(start) : "";
}
