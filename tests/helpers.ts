import type { Landmark } from "../src/core/exercises/types.ts";

/** 33 landmark بثقة صفر، ثم نملأ المطلوب فقط */
export function makeLandmarks(set: Record<number, [number, number, number?]>): Landmark[] {
  const lms: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  for (const [i, [x, y, vis]] of Object.entries(set)) lms[Number(i)] = { x, y, visibility: vis ?? 0.99 };
  return lms;
}
