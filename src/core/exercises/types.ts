// أنواع مشتركة للمنطق الصافي (بدون أي اعتماد على المتصفح أو React)

export interface Landmark {
  x: number; // 0..1 (عرض الصورة)
  y: number; // 0..1 (ارتفاع الصورة، لأسفل)
  z?: number;
  visibility?: number; // 0..1
}

// مفاتيح القياسات المحسوبة من الـ landmarks
export type MetricKey = "knee" | "hip" | "elbow" | "torso" | "bodyLine" | "hipDrop";
export type Metrics = Partial<Record<MetricKey, number>>;

// "normal" للشباب والمعتاد، "easy" لمبتدئين وكبار السن ومحدودي الحركة (حدود أوسع)
export type Level = "normal" | "easy";

export interface Thresholds {
  normal: number;
  easy: number;
}

// فحص وضعية: test يرجّع true لو الوضعية سليمة
export interface FormCheck {
  id: string;
  // bottom: يُفحص عند أعمق نقطة في التكرار، any: يُفحص طول الحركة، hold: أثناء الثبات
  when: "bottom" | "any" | "hold";
  test: (m: Metrics, level: Level) => boolean;
  needs: MetricKey[];
  msg: string; // نص بالعامية المصرية يُنطق
}

export interface ExerciseDef {
  id: string;
  name: string;
  mode: "reps" | "hold";
  primary: MetricKey; // القياس الأساسي الذي تُحدَّد به المراحل
  // reps: فوق (up) لما القياس > upAbove، نزول (down) لما < downBelow
  upAbove: Thresholds;
  downBelow: Thresholds;
  // القياسات المطلوب ظهورها بثقة كافية لتحليل الإطار
  requires: MetricKey[];
  checks: FormCheck[];
  /** تمرين مقلوب: وضع الراحة = قيمة منخفضة والذروة = قيمة مرتفعة (مثل جسر الأرداف). downBelow = حد الراحة، upAbove = حد الذروة. */
  inverted?: boolean;
  /** جلسة بوقت محدد بالثواني (مثل اختبار الوقوف من الجلوس 30 ثانية). تنتهي الجلسة تلقائيًا. */
  durationSec?: number;
  /** زاوية التصوير المطلوبة. الافتراضي "side" لأن زوايا المفاصل بتتحسب غلط من الأمام. */
  view?: "side" | "any";
  cues: {
    start: string;
    goodRep: string;
    badRep: string;
    holdMilestone?: string;
  };
}
