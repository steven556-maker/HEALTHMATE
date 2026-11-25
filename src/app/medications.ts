import {
  addStock, daysLeft, editMedication, dosesForDay, isLowStock, medicationSummary as summarize, newMedication,
  parseTimes, removeMedication, stockOf, toggleDoseStatus,
} from "../core/medications.ts";
import type { Medication } from "../core/medications.ts";
import { pushState, enablePush, disablePush } from "./push.ts";
import { dateKey } from "../core/medications.ts";
import { getLocale, t } from "./i18n.ts";
import { notifyLocalDataChanged } from "./cloud-events.ts";
import { $, setFieldError, showEmptyState, showToast } from "./ui.ts";
import { enableReminders, reminderState } from "./reminders.ts";
import { readAllMedications, readMedications } from "./med-store.ts";

// واجهة منظم الأدوية. المنطق كله في core/medications.ts (دوال صافية مختبرة).
//  - الجرعة المجدولة هويتها التاريخ:وقت_الجدول (مش وقت الضغط)، وليها زرّين (تم/فاتت) لكل جرعة.
//  - الحذف tombstone، فبيفضل محفوظ في التخزين عشان ينتقل للأجهزة التانية.

const MED_KEY = "hm.medications";

function saveMedications(rows: Medication[]): boolean {
  try {
    localStorage.setItem(MED_KEY, JSON.stringify(rows));
    notifyLocalDataChanged();
    return true;
  } catch {
    showToast(t("storageUnavailable"));
    return false;
  }
}
function updateMedication(id: string, change: (med: Medication) => Medication): void {
  const rows = readAllMedications();
  if (!rows.some((row) => row.id === id)) return;
  if (saveMedications(rows.map((row) => (row.id === id ? change(row) : row)))) refresh();
}
function refresh(): void {
  renderMedications();
  window.dispatchEvent(new Event("healthmate:refresh"));
}

export function medicationSummary(): Record<string, { taken: number; total: number }> {
  return summarize(readMedications(), new Date(), 30);
}

function initMedications(): void {
  $("btn-add-med").onclick = () => {
    const name = $<HTMLInputElement>("med-name").value.trim();
    const dose = $<HTMLInputElement>("med-dose").value.trim();
    const times = $<HTMLInputElement>("med-times").value.trim();
    const rawStock = $<HTMLInputElement>("med-stock").value.trim();
    const stock = rawStock === "" ? 0 : Number(rawStock);
    if (!name || !dose || !times) { setFieldError("med-form-error", t("medAddRequired")); return; }
    const parsed = parseTimes(times);
    if (!parsed || !Number.isFinite(stock) || stock < 0) { setFieldError("med-form-error", t("medicationInvalid")); return; }
    setFieldError("med-form-error", "");
    const med = newMedication({ id: crypto.randomUUID(), name, dose, times: parsed.join(", "), stock: Math.floor(stock) }, Date.now());
    if (!saveMedications([...readAllMedications(), med])) return;
    for (const id of ["med-name", "med-dose", "med-times"] as const) $<HTMLInputElement>(id).value = "";
    // طلب إذن الإشعارات لازم يكون من ضغطة المستخدم
    if (reminderState() === "default") void enableReminders().then(renderMedications);
    refresh();
  };
  $("btn-share-med-log").onclick = () => void shareMedicationLog();
  $("btn-enable-reminders").onclick = () => void enableReminders().then(renderReminderStatus);
  $("btn-toggle-push").onclick = () => void togglePush();
  window.addEventListener("healthmate:locale", renderMedications);
  window.addEventListener("healthmate:refresh", () => { if (!$<HTMLElement>("tab-medications").hidden) renderMedications(); });
  // الجرعات بتتحدّث (مثلًا ظهور جرعة جديدة بعد منتصف الليل) من غير ما المستخدم يعمل حاجة
  window.setInterval(() => { if (!$<HTMLElement>("tab-medications").hidden) renderMedications(); }, 60_000);
  renderMedications();
}

async function togglePush(): Promise<void> {
  const button = $<HTMLButtonElement>("btn-toggle-push");
  button.disabled = true;
  if (pushState() === "on") { await disablePush(); showToast(t("pushDisabled"), 5000); }
  else {
    const result = await enablePush();
    showToast(t(result === "ok" ? "pushEnabled" : result === "sign_in" ? "pushNeedsSignIn" : result === "denied" ? "remindersBlocked" : "pushFailed"), 6000);
  }
  button.disabled = false;
  renderReminderStatus();
}

function renderReminderStatus(): void {
  const pushStatus = $("push-status");
  const pushButton = $("btn-toggle-push");
  const push = pushState();
  pushButton.hidden = push === "unsupported" || push === "blocked";
  pushStatus.textContent = push === "on" ? t("pushOn") : push === "off" ? t("pushOff") : "";
  pushButton.textContent = push === "on" ? t("pushDisable") : t("pushEnable");
  const state = reminderState();
  const status = $("reminder-status");
  const button = $("btn-enable-reminders");
  status.textContent = state === "granted" ? t("remindersOn") : state === "denied" ? t("remindersBlocked") : state === "unsupported" ? t("remindersUnsupported") : t("remindersOff");
  button.hidden = state !== "default";
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function renderMedications(): void {
  renderReminderStatus();
  const root = $("med-list");
  root.replaceChildren();
  const meds = readMedications();
  if (!meds.length) { showEmptyState(root, t("noMedications")); return; }
  const now = new Date();

  // جرعات النهارده: زرّين (تم / فاتت) لكل جرعة مجدولة
  root.append(el("h2", "med-heading", t("todayDoses")));
  const doses = dosesForDay(meds, now);
  const list = el("div", "dose-list");
  for (const dose of doses) {
    const row = el("article", "dose-row");
    row.dataset.status = dose.status ?? "";
    const label = el("div", "dose-label");
    label.append(el("b", "", `${dose.time} — ${dose.med.name}`), el("small", "", dose.med.dose));
    const actions = el("div", "dose-actions");
    for (const status of ["taken", "missed"] as const) {
      const button = el("button", "btn dose-btn", t(status));
      button.type = "button";
      button.setAttribute("aria-pressed", String(dose.status === status));
      button.onclick = () => updateMedication(dose.med.id, (med) => toggleDoseStatus(med, dose.key, status, Date.now()));
      actions.append(button);
    }
    row.append(label, actions);
    list.append(row);
  }
  root.append(list);

  // بطاقات الأدوية: المخزون والتعبئة والحذف
  root.append(el("h2", "med-heading", t("medicationsList")));
  for (const med of meds) {
    const card = el("article", "coach-suggestion medication-card");
    card.append(el("b", "", `${med.name} — ${med.dose}`));
    const left = daysLeft(med);
    const detail = `${t("scheduleLabel")}: ${med.times} · ${t("remainingLabel")}: ${stockOf(med)} (${t("daysLeftShort", { days: Math.floor(left) })})`;
    card.append(el("p", "", isLowStock(med) ? `${detail} · ${t("lowStock")}` : detail));

    const refill = el("div", "refill-row");
    const qty = el("input"); qty.type = "number"; qty.min = "1"; qty.step = "1"; qty.inputMode = "numeric";
    qty.setAttribute("aria-label", t("refillQty")); qty.placeholder = t("refillQty");
    const add = el("button", "btn", t("addStock")); add.type = "button";
    add.onclick = () => {
      const amount = Math.floor(Number(qty.value));
      if (!Number.isFinite(amount) || amount <= 0) { showToast(t("refillInvalid")); return; }
      updateMedication(med.id, (row) => addStock(row, amount, crypto.randomUUID(), Date.now()));
      showToast(t("refillDone", { qty: amount }));
    };
    refill.append(qty, add);

    // حذف بخطوتين (من غير confirm() الأصلي): أول ضغطة بتطلب تأكيد، والتانية بتحذف
    const remove = el("button", "btn danger", t("delete")); remove.type = "button";
    let armed = 0;
    remove.onclick = () => {
      if (!armed) {
        remove.textContent = t("confirmDelete");
        armed = window.setTimeout(() => { armed = 0; remove.textContent = t("delete"); }, 4000);
        return;
      }
      window.clearTimeout(armed);
      updateMedication(med.id, (row) => removeMedication(row, Date.now()));
    };
    // تعديل: فورم صغير جوه الكارت (الاسم/الجرعة/المواعيد). السجل والمخزون ما بيتغيروش.
    const edit = el("button", "btn", (getLocale() === "en" ? "Edit" : "تعديل")); edit.type = "button";
    edit.onclick = () => {
      const form = el("div", "med-edit");
      const mk = (label: string, value: string, max: number): HTMLInputElement => {
        const wrap = el("label", "field"); wrap.append(el("span", "", label));
        const input = el("input"); input.value = value; input.maxLength = max; wrap.append(input); form.append(wrap); return input;
      };
      const nameIn = mk(t("medicationName"), med.name, 80);
      const doseIn = mk(t("medicationDose"), med.dose, 100);
      const timesIn = mk(t("medicationTimes"), med.times, 60);
      const err = el("p", "form-error"); err.setAttribute("role", "alert"); err.hidden = true;
      const save = el("button", "btn primary", t("save")); save.type = "button";
      save.onclick = () => {
        const next = editMedication(med, { name: nameIn.value, dose: doseIn.value, times: timesIn.value }, Date.now());
        if (next === med) { err.textContent = t("medicationInvalid"); err.hidden = false; return; }
        updateMedication(med.id, (row) => editMedication(row, { name: nameIn.value, dose: doseIn.value, times: timesIn.value }, Date.now()));
        showToast(t("save"));
      };
      const cancel = el("button", "btn", t("back")); cancel.type = "button";
      cancel.onclick = () => renderMedications();
      form.append(err, save, cancel);
      edit.replaceWith(form);
    };
    card.append(refill, edit, remove);
    root.append(card);
  }
}

async function shareMedicationLog(): Promise<void> {
  const today = new Date();
  const since = dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6));
  const rows = readMedications();
  if (!rows.length) { showToast(t("noMedicationLog")); return; }
  const lines = [t("medicationLogTitle"), ...rows.flatMap((med) => {
    const records = Object.entries(med.log)
      .filter(([key, status]) => key.slice(0, 10) >= since && (status === "taken" || status === "missed"))
      .sort(([a], [b]) => a.localeCompare(b));
    return [`${med.name} · ${med.dose}`, ...(records.length ? records.map(([key, status]) => `${key.slice(0, 10)} ${key.slice(11)}: ${t(status as "taken" | "missed")}`) : [t("noRecentMedicationLog")])];
  }), "", t("medicationSharePrivacy")];
  const text = lines.join("\n");
  try {
    if (navigator.share) await navigator.share({ title: t("medicationLogTitle"), text });
    else { await navigator.clipboard.writeText(text); showToast(t("reportCopied")); }
  } catch { /* المشاركة اتلغت */ }
}

export { initMedications, renderMedications };
