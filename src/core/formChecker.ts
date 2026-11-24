import type { ExerciseDef, FormCheck, Level, MetricKey, Metrics } from "./exercises/types.ts";

/** كل القياسات اللي التمرين محتاجها (الأساسية + اللي تحتاجها الفحوصات) */
export function metricKeysFor(def: ExerciseDef): MetricKey[] {
  const keys = new Set<MetricKey>([def.primary, ...def.requires]);
  for (const c of def.checks) c.needs.forEach((k) => keys.add(k));
  return [...keys];
}

/**
 * يرجّع الفحوصات الفاشلة من نوع `when`. أي فحص ناقصه قياس (غير ظاهر) يتجاهَل
 * بدل ما يتحكم عليه، عشان ما نصحّح المستخدم على بيانات مش موثوقة.
 */
export function evaluateChecks(
  def: ExerciseDef,
  metrics: Metrics,
  level: Level,
  when: FormCheck["when"],
): FormCheck[] {
  return def.checks.filter(
    (c) => c.when === when && c.needs.every((k) => metrics[k] !== undefined) && !c.test(metrics, level),
  );
}
