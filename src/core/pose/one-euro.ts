// فلتر One Euro: بيقلل رعشة النقط وقت الوقوف ومابيتأخرش وقت الحركة السريعة
import type { Landmark } from "../exercises/types.ts";

export interface OneEuroOptions {
  minCutoff?: number; // أقل = تثبيت أقوى
  beta?: number; // أعلى = تأخير أقل وقت الحركة
  dCutoff?: number;
}

const alpha = (cutoff: number, dt: number): number => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

function createChannel(opts: Required<OneEuroOptions>) {
  let prev: number | null = null;
  let dPrev = 0;
  let prevT = 0;
  return {
    filter(x: number, tSec: number): number {
      if (prev === null || tSec <= prevT) { prev = x; dPrev = 0; prevT = tSec; return x; }
      const dt = tSec - prevT;
      prevT = tSec;
      const dx = (x - prev) / dt;
      dPrev = dPrev + alpha(opts.dCutoff, dt) * (dx - dPrev);
      const cutoff = opts.minCutoff + opts.beta * Math.abs(dPrev);
      prev = prev + alpha(cutoff, dt) * (x - prev);
      return prev;
    },
  };
}

export function createLandmarkFilter(options: OneEuroOptions = {}) {
  // قيم مبدئية، لسه محتاجة ضبط بالتجربة
  const opts: Required<OneEuroOptions> = { minCutoff: options.minCutoff ?? 1.5, beta: options.beta ?? 8, dCutoff: options.dCutoff ?? 1 };
  const channels = new Map<string, ReturnType<typeof createChannel>>();
  const ch = (key: string) => {
    let c = channels.get(key);
    if (!c) { c = createChannel(opts); channels.set(key, c); }
    return c;
  };
  return {
    apply(lms: Landmark[], nowMs: number): Landmark[] {
      const t = nowMs / 1000;
      return lms.map((l, i) => ({
        ...l,
        x: ch(`${i}x`).filter(l.x, t),
        y: ch(`${i}y`).filter(l.y, t),
        ...(l.z !== undefined ? { z: ch(`${i}z`).filter(l.z, t) } : {}),
      }));
    },
    reset(): void { channels.clear(); },
  };
}
