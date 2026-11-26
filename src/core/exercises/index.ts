import type { ExerciseDef } from "./types.ts";
import { squat } from "./squat.ts";
import { pushup } from "./pushup.ts";
import { plank } from "./plank.ts";
import { lunge } from "./lunge.ts";
import { gluteBridge } from "./glute-bridge.ts";
import { wallSit } from "./wall-sit.ts";
import { sitToStand } from "./sit-to-stand.ts";
import { highKnees, mountainClimbers, legRaise } from "./more.ts";
import { WEIGHTED } from "./weighted.ts";

// لإضافة تمرين جديد: اكتب ملف واحد بنفس شكل squat.ts وأضفه هنا
export const EXERCISES: ExerciseDef[] = [squat, pushup, plank, lunge, gluteBridge, wallSit, sitToStand, highKnees, mountainClimbers, legRaise, ...WEIGHTED];

export function getExercise(id: string): ExerciseDef {
  const ex = EXERCISES.find((e) => e.id === id);
  if (!ex) throw new Error(`تمرين غير معروف: ${id}`);
  return ex;
}

/** التمارين اللي لازم تتصوّر من الجنب (زوايا المفاصل بتتحسب غلط من الأمام) */
export const needsSideView = (def: ExerciseDef): boolean => def.view !== "any";

export * from "./types.ts";
