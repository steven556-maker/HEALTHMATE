import type { MetricKey, Metrics } from "../exercises/types.ts";

/** متوسط متحرك لكل قياس لتقليل ارتعاش الـ landmarks */
export function createSmoother(windowSize = 5) {
  const buffers = new Map<MetricKey, number[]>();
  return {
    push(m: Metrics): Metrics {
      const out: Metrics = {};
      for (const key of Object.keys(m) as MetricKey[]) {
        const v = m[key];
        if (v === undefined) continue;
        const buf = buffers.get(key) ?? [];
        buf.push(v);
        if (buf.length > windowSize) buf.shift();
        buffers.set(key, buf);
        out[key] = buf.reduce((a, b) => a + b, 0) / buf.length;
      }
      return out;
    },
    reset() {
      buffers.clear();
    },
  };
}
