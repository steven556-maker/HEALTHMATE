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

/** حالة فارغة واضحة (أيقونة + جملة) بدل نص مجرد، من غير أي أرقام تجريبية. */
export function showEmptyState(root: HTMLElement, message: string): void {
  root.textContent = "";
  const box = document.createElement("div");
  box.className = "empty-state";
  box.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>';
  const p = document.createElement("p");
  p.textContent = message;
  box.append(p);
  root.append(box);
}
