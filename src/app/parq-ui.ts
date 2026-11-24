import { PARQ_QUESTIONS, makeParqRecord, parqResult } from "../core/parq.ts";
import type { ParqAnswers, ParqQuestion } from "../core/parq.ts";
import { store } from "./storage.ts";
import { t } from "./i18n.ts";
import { $ } from "./ui.ts";

// استبيان الجاهزية (PAR-Q مبسّط). مرة واحدة قبل أول جلسة، وتقدر تعيده من الإعدادات.
// للتوعية فقط: مفيش تشخيص، ولو فيه "نعم" بننصح بالطبيب من غير ما نمنع المستخدم.
const QUESTION_KEYS: Record<ParqQuestion, Parameters<typeof t>[0]> = {
  heart: "parqHeart", chestPain: "parqChestPain", chestPainRest: "parqChestPainRest", dizzy: "parqDizzy",
  joint: "parqJoint", pressureMeds: "parqPressureMeds", other: "parqOther",
};

let onDone: (() => void) | null = null;
let acknowledged = false;

function readAnswers(): ParqAnswers {
  const answers: ParqAnswers = {};
  for (const q of PARQ_QUESTIONS) {
    const checked = document.querySelector<HTMLInputElement>(`input[name="parq-${q}"]:checked`);
    if (checked) answers[q] = checked.value === "yes";
  }
  return answers;
}

function build(): void {
  const form = $("parq-form");
  form.replaceChildren();
  const saved = store.getParq()?.answers ?? {};
  PARQ_QUESTIONS.forEach((q, index) => {
    const group = document.createElement("fieldset"); group.className = "parq-question";
    const legend = document.createElement("legend"); legend.textContent = `${index + 1}. ${t(QUESTION_KEYS[q])}`;
    group.append(legend);
    for (const value of ["yes", "no"] as const) {
      const label = document.createElement("label"); label.className = "parq-option";
      const input = document.createElement("input"); input.type = "radio"; input.name = `parq-${q}`; input.value = value;
      input.checked = saved[q] === (value === "yes");
      const text = document.createElement("span"); text.textContent = t(value === "yes" ? "parqYes" : "parqNo");
      label.append(input, text); group.append(label);
    }
    form.append(group);
  });
}

function close(): void { $("parq").hidden = true; }

export function openParq(done?: () => void): void {
  onDone = done ?? null;
  acknowledged = false;
  build();
  $("parq-result").textContent = "";
  $("parq-error").hidden = true;
  $("btn-parq-submit").textContent = t("parqSubmit");
  $("parq").hidden = false;
  $("parq-title").focus();
}

export function initParq(): void {
  $("btn-parq-cancel").onclick = () => { onDone = null; close(); };
  $("btn-parq-submit").onclick = () => {
    const error = $("parq-error");
    if (acknowledged) { close(); const next = onDone; onDone = null; next?.(); return; }
    const answers = readAnswers();
    const record = makeParqRecord(answers, Date.now());
    if (!record) { error.textContent = t("parqIncomplete"); error.hidden = false; return; }
    error.hidden = true;
    store.saveParq(record);
    if (parqResult(answers) === "clear") { close(); const next = onDone; onDone = null; next?.(); return; }
    // فيه "نعم": نعرض النصيحة، والمستخدم هو اللي يقرر يكمّل
    acknowledged = true;
    $("parq-result").textContent = t("parqConsult");
    $("btn-parq-submit").textContent = t("parqContinue");
  };
  window.addEventListener("healthmate:locale", () => { if (!$<HTMLElement>("parq").hidden && !acknowledged) build(); });
}
