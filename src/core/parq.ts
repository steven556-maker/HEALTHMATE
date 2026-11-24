// استبيان جاهزية قبل التمرين (PAR-Q مبسّط، 7 أسئلة). للتوعية فقط ومش تقييم طبي.
// أي إجابة "نعم" = ننصح باستشارة الطبيب قبل البدء. التطبيق مش بيمنع المستخدم ولا بيشخّص.

export const PARQ_QUESTIONS = ["heart", "chestPain", "chestPainRest", "dizzy", "joint", "pressureMeds", "other"] as const;
export type ParqQuestion = (typeof PARQ_QUESTIONS)[number];
export type ParqAnswers = Partial<Record<ParqQuestion, boolean>>;
export type ParqResult = "clear" | "consult" | "incomplete";

export interface ParqRecord { answers: ParqAnswers; result: Exclude<ParqResult, "incomplete">; at: number; updatedAt: number }

export function parqResult(answers: ParqAnswers): ParqResult {
  if (PARQ_QUESTIONS.some((q) => typeof answers[q] !== "boolean")) return "incomplete";
  return PARQ_QUESTIONS.some((q) => answers[q] === true) ? "consult" : "clear";
}

export function makeParqRecord(answers: ParqAnswers, now: number): ParqRecord | null {
  const result = parqResult(answers);
  if (result === "incomplete") return null;
  return { answers: { ...answers }, result, at: now, updatedAt: now };
}

export function readParqRecord(raw: unknown): ParqRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<ParqRecord>;
  if (!r.answers || typeof r.answers !== "object" || !Number.isFinite(r.at)) return null;
  const result = parqResult(r.answers);
  if (result === "incomplete") return null;
  return { answers: r.answers, result, at: r.at as number, updatedAt: Number.isFinite(r.updatedAt) ? r.updatedAt as number : r.at as number };
}
