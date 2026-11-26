import { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { t } from "./i18n.ts";
import { authLanding, hasSupabaseConfig } from "./cloud-config.ts";
import HealthDashboard from "../components/ui/health-glass-dashboard.tsx";
import "../styles/tailwind.css";
import "../styles/health-dashboard.css";

const tabs = ["workout", "progress", "food", "medications", "assistant"] as const;
type Tab = (typeof tabs)[number];
const tabLabels = ["workoutTab", "progressTab", "foodTab", "medicationsTab", "assistantTab"] as const;
const paths = [
  <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></>,
  <><path d="M3 3v18h18"/><path d="m7 14 4-4 4 3 6-7"/></>,
  <><path d="M7 3v8a2 2 0 0 0 2 2v8"/><path d="M11 3v8a2 2 0 0 1-2 2"/><path d="M9 3v6"/><path d="M17 3c-2 1.5-3 4-3 7 0 1.5.8 2.5 2 3v8"/></>,
  <><path d="M10 3h4v5h-4z"/><path d="M8 8h8a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3Z"/><path d="M9 14h6"/></>,
  <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 4a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></>,
];
const SignInPage = lazy(() => import("../components/ui/sign-in.tsx").then((module) => ({ default: module.SignInPage })));

function Navigation() {
  const [active, setActive] = useState<Tab>("workout");
  const [, setLocaleRevision] = useState(0);
  useEffect(() => {
    const onLocale = () => setLocaleRevision((value) => value + 1);
    const onNavigate = (event: Event) => setActive((event as CustomEvent<Tab>).detail);
    window.addEventListener("healthmate:locale", onLocale);
    window.addEventListener("healthmate:navigate", onNavigate);
    return () => {
      window.removeEventListener("healthmate:locale", onLocale);
      window.removeEventListener("healthmate:navigate", onNavigate);
    };
  }, []);
  return (
    <nav className="healthmate-nav" aria-label="HEALTHMATE">
      {tabs.map((tab, index) => (
        <button key={tab} type="button" aria-current={active === tab ? "page" : undefined} onClick={() => {
          setActive(tab);
          window.dispatchEvent(new CustomEvent<Tab>("healthmate:navigate", { detail: tab }));
        }}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{paths[index]}</svg>
          <span>{t(tabLabels[index])}</span>
        </button>
      ))}
    </nav>
  );
}

const navigationRoot = document.getElementById("healthmate-nav-root");
if (navigationRoot) createRoot(navigationRoot).render(<Navigation />);

const progressRoot = document.getElementById("health-progress-root");
if (progressRoot) createRoot(progressRoot).render(<HealthDashboard />);

function AccountOverlay() {
  // لو المستخدم وصل من لينك إيميل (تأكيد/استعادة كلمة المرور) أو رجوع بخطأ، نفتح نافذة الحساب مباشرة.
  // من غير كده كان اللينك بيفتح التطبيق ومفيش حاجة بتحصل (العميل ما بيتحمّلش إلا لما النافذة تتفتح).
  const [open, setOpen] = useState(() => hasSupabaseConfig && authLanding.active);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener("healthmate:open-account", show);
    return () => window.removeEventListener("healthmate:open-account", show);
  }, []);
  return open ? <Suspense fallback={null}><SignInPage onClose={() => setOpen(false)} /></Suspense> : null;
}

const accountRoot = document.getElementById("account-page-root");
if (accountRoot) createRoot(accountRoot).render(<AccountOverlay />);
