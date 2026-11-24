import type { Landmark, MetricKey, Metrics } from "../exercises/types.ts";

// فهارس MediaPipe Pose
export const LM = {
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13, R_ELBOW: 14,
  L_WRIST: 15, R_WRIST: 16,
  L_HIP: 23, R_HIP: 24,
  L_KNEE: 25, R_KNEE: 26,
  L_ANKLE: 27, R_ANKLE: 28,
} as const;

type Pt = { x: number; y: number };

/** الزاوية عند النقطة b بين الخطين b→a و b→c بالدرجات (0..180) */
export function angle(a: Pt, b: Pt, c: Pt): number {
  const v1x = a.x - b.x, v1y = a.y - b.y;
  const v2x = c.x - b.x, v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const n = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (n === 0) return NaN;
  const cos = Math.min(1, Math.max(-1, dot / n));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** ميل الخط من a إلى b عن الرأسي بالدرجات (0 = رأسي تمامًا) */
export function angleFromVertical(top: Pt, bottom: Pt): number {
  const dx = bottom.x - top.x, dy = bottom.y - top.y;
  if (dx === 0 && dy === 0) return NaN;
  return (Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI;
}

interface Side {
  shoulder: number; elbow: number; wrist: number;
  hip: number; knee: number; ankle: number;
}
const LEFT: Side = {
  shoulder: LM.L_SHOULDER, elbow: LM.L_ELBOW, wrist: LM.L_WRIST,
  hip: LM.L_HIP, knee: LM.L_KNEE, ankle: LM.L_ANKLE,
};
const RIGHT: Side = {
  shoulder: LM.R_SHOULDER, elbow: LM.R_ELBOW, wrist: LM.R_WRIST,
  hip: LM.R_HIP, knee: LM.R_KNEE, ankle: LM.R_ANKLE,
};

type JointName = keyof Side;
interface MetricSpec {
  joints: JointName[];
  compute: (p: Pt[]) => number;
}

const SPECS: Record<MetricKey, MetricSpec> = {
  knee: { joints: ["hip", "knee", "ankle"], compute: (p) => angle(p[0], p[1], p[2]) },
  hip: { joints: ["shoulder", "hip", "knee"], compute: (p) => angle(p[0], p[1], p[2]) },
  elbow: { joints: ["shoulder", "elbow", "wrist"], compute: (p) => angle(p[0], p[1], p[2]) },
  torso: { joints: ["shoulder", "hip"], compute: (p) => angleFromVertical(p[0], p[1]) },
  // 180 = جسم مستقيم (كتف-ورك-كاحل)
  bodyLine: { joints: ["shoulder", "hip", "ankle"], compute: (p) => angle(p[0], p[1], p[2]) },
  // انحراف الورك عن خط الكتف-الكاحل كنسبة من طول الخط. موجب = الورك أنزل (هبوط)، سالب = أعلى (رفع)
  hipDrop: {
    joints: ["shoulder", "hip", "ankle"],
    compute: (p) => {
      const [s, h, a] = p;
      const len = Math.hypot(a.x - s.x, a.y - s.y);
      if (len === 0 || a.x === s.x) return NaN;
      const expectedY = s.y + ((h.x - s.x) * (a.y - s.y)) / (a.x - s.x);
      return (h.y - expectedY) / len;
    },
  },
};

function sideVisible(lms: Landmark[], side: Side, joints: JointName[], minVis: number): boolean {
  return joints.every((j) => {
    const l = lms[side[j]];
    return l !== undefined && (l.visibility ?? 1) >= minVis;
  });
}

/**
 * يحسب القياسات المطلوبة فقط. لو الجانبين ظاهرين بثقة كافية يتم أخذ المتوسط،
 * ولو جانب واحد ظاهر (تصوير جانبي) يُستخدم هو. غير الظاهر يُترك undefined.
 */
export function computeMetrics(lms: Landmark[], keys: MetricKey[], minVis = 0.5): Metrics {
  const out: Metrics = {};
  for (const key of keys) {
    const spec = SPECS[key];
    const values: number[] = [];
    for (const side of [LEFT, RIGHT]) {
      if (!sideVisible(lms, side, spec.joints, minVis)) continue;
      const pts = spec.joints.map((j) => lms[side[j]]);
      const v = spec.compute(pts);
      if (Number.isFinite(v)) values.push(v);
    }
    if (values.length) out[key] = values.reduce((a, b) => a + b, 0) / values.length;
  }
  return out;
}

/** هل الجسم كله داخل الكادر بثقة كافية؟ (لشاشة ضبط وضع الموبايل) */
export function bodyFraming(lms: Landmark[], minVis = 0.35): "ok" | "no_body" | "too_close" | "cut_off" {
  // Include head and foot landmarks. 0.35 is more tolerant of phone cameras and
  // side views, while still requiring reliable evidence at both ends of the body.
  const ids = [0, ...Object.values(LM), 29, 30, 31, 32]; // nose, joints, heels and foot indices
  const seen = ids.filter((i) => (lms[i]?.visibility ?? 0) >= minVis);
  const shouldersSeen = [LM.L_SHOULDER, LM.R_SHOULDER].some((i) => (lms[i]?.visibility ?? 0) >= minVis);
  if (!shouldersSeen || seen.length < 4) return "no_body";
  const headSeen = (lms[0]?.visibility ?? 0) >= minVis || shouldersSeen;
  const feetSeen = [LM.L_ANKLE, LM.R_ANKLE, 29, 30, 31, 32].some((i) => (lms[i]?.visibility ?? 0) >= minVis);
  if (!headSeen || !feetSeen) return "too_close";
  const outside = ids.some((i) => {
    const l = lms[i];
    return l && (l.visibility ?? 0) >= minVis && (l.x < 0.02 || l.x > 0.98 || l.y < 0.02 || l.y > 0.98);
  });
  return outside ? "cut_off" : "ok";
}

export type ViewOrientation = "front" | "side" | "angled" | "unknown";

/**
 * اتجاه الجسم بالنسبة للكاميرا: بنقارن عرض الكتفين (في الصورة) بطول الجذع.
 * من الأمام الكتفين متباعدين (النسبة كبيرة)، ومن الجنب بيتراكبوا (النسبة صغيرة).
 * aspect = عرض الفيديو ÷ ارتفاعه، لأن إحداثيات MediaPipe متطبّعة (0..1) في الاتجاهين بمقياس مختلف.
 */
export function viewOrientation(lms: Landmark[], aspect = 4 / 3, minVis = 0.5): ViewOrientation {
  const ls = lms[LM.L_SHOULDER], rs = lms[LM.R_SHOULDER];
  const hips = [lms[LM.L_HIP], lms[LM.R_HIP]].filter((l): l is Landmark => !!l && (l.visibility ?? 0) >= minVis);
  if (!ls || !rs || (ls.visibility ?? 0) < minVis || (rs.visibility ?? 0) < minVis || hips.length === 0) return "unknown";
  const hipX = hips.reduce((sum, l) => sum + l.x, 0) / hips.length;
  const hipY = hips.reduce((sum, l) => sum + l.y, 0) / hips.length;
  const shoulderWidth = Math.abs(ls.x - rs.x) * aspect;
  const torsoLength = Math.hypot(((ls.x + rs.x) / 2 - hipX) * aspect, (ls.y + rs.y) / 2 - hipY);
  if (torsoLength === 0) return "unknown";
  const ratio = shoulderWidth / torsoLength;
  if (ratio >= 0.55) return "front";
  if (ratio <= 0.3) return "side";
  return "angled";
}
