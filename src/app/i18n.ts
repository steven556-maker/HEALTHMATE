import ar from "../locales/ar.json";
import en from "../locales/en.json";

export type Locale = "ar" | "en";
type Dictionary = Record<keyof typeof ar, string>;
const dictionaries: Record<Locale, Dictionary> = { ar, en };
const LANGUAGE_KEY = "hm.language";
let locale: Locale = readLocale();

function readLocale(): Locale {
  try {
    return localStorage.getItem(LANGUAGE_KEY) === "en" ? "en" : "ar";
  } catch {
    return "ar";
  }
}

export function getLocale(): Locale {
  return locale;
}

export function t(key: keyof typeof ar, values: Record<string, string | number> = {}): string {
  return dictionaries[locale][key].replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ""));
}

export function applyLocale(next: Locale = locale): void {
  locale = next;
  try {
    localStorage.setItem(LANGUAGE_KEY, locale);
  } catch {
    // Keep the in-memory language if browser storage is unavailable.
  }
  const root = document.documentElement;
  root.lang = locale;
  root.dir = locale === "ar" ? "rtl" : "ltr";
  root.dataset.locale = locale;
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n as keyof typeof ar;
    if (key in dictionaries[locale]) element.textContent = t(key);
  });
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder as keyof typeof ar);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-aria-label]").forEach((element) => {
    const value = t(element.dataset.i18nAriaLabel as keyof typeof ar);
    element.setAttribute("aria-label", value);
    if (element.hasAttribute("title")) element.setAttribute("title", value);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((element) => {
    element.title = t(element.dataset.i18nTitle as keyof typeof ar);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-before]").forEach((element) => {
    const key = element.dataset.i18nBefore as keyof typeof ar;
    const text = element.firstChild;
    if (text?.nodeType === Node.TEXT_NODE) text.textContent = ` ${t(key)} `;
  });
  const switcher = document.getElementById("btn-language");
  if (switcher) {
    const english = document.createElement("span");
    english.textContent = t("langEnglish");
    english.classList.toggle("is-current", locale === "en");
    const divider = document.createElement("i");
    divider.textContent = "|";
    divider.setAttribute("aria-hidden", "true");
    const arabic = document.createElement("span");
    arabic.textContent = t("langArabic");
    arabic.classList.toggle("is-current", locale === "ar");
    switcher.replaceChildren(english, divider, arabic);
    switcher.setAttribute("aria-label", t("languageSwitch"));
    switcher.setAttribute("lang", locale === "ar" ? "en" : "ar");
    switcher.setAttribute("dir", "auto");
  }
  root.dataset.localeReady = "true";
  window.dispatchEvent(new CustomEvent<Locale>("healthmate:locale", { detail: locale }));
}
