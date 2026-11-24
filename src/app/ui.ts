// أدوات واجهة مشتركة: جلب عنصر بالـ id، ورسالة مؤقتة داخل الصفحة بدل alert().
export const $ = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
};

let toastTimer = 0;
/** رسالة قصيرة أسفل الشاشة (role=status). بتتقرا بقارئ الشاشة ومش بتقفل الصفحة زي alert(). */
export function showToast(message: string, ms = 3500): void {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast!.hidden = true; }, ms);
}

/** يعرض/يخفي رسالة خطأ داخل نموذج (role=alert في الـ HTML) */
export function setFieldError(id: string, message: string): void {
  const element = $(id);
  element.textContent = message;
  element.hidden = !message;
}
