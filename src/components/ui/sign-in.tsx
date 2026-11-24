import { useEffect, useState, type FormEvent } from "react";
import { Activity, Bell, CloudUpload, Dumbbell, Eye, EyeOff, LineChart, ShieldCheck, X } from "lucide-react";
import { autoSyncAfterSignIn, deleteAccountAndData, getCloudAccount, getLastCloudErrorKey, initCloudSync, resetPassword, resolveAccountMismatch, setCloudSyncConsent, signIn, signInWithGoogle, signOut, signUp, syncSignedInAccount, updatePassword } from "../../app/cloud-sync.ts";
import { getLocale, t } from "../../app/i18n.ts";
import { authLanding, googleAuthEnabled } from "../../app/cloud-config.ts";
import { disablePush } from "../../app/push.ts";
import { store } from "../../app/storage.ts";

type Mode = "signIn" | "signUp";
type Account = Awaited<ReturnType<typeof getCloudAccount>>;

export function SignInPage({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("signIn");
  const [resetFlow, setResetFlow] = useState(() => authLanding.recovery);
  const [account, setAccount] = useState<Account>({ email: null, configured: false, consented: false, deviceLinkedElsewhere: false, lastSyncAt: null });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(() => (authLanding.error ? `${t("cloudLinkInvalid")} (${authLanding.error})` : ""));
  const [, setLocaleRevision] = useState(0);

  const applyAccount = (next: Account) => { setAccount(next); setConsent(next.consented); };

  useEffect(() => {
    initCloudSync();
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const dialog = document.querySelector<HTMLElement>(".account-overlay[role='dialog']");
      const controls = dialog ? [...dialog.querySelectorAll<HTMLElement>("a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])")].filter((el) => el.offsetParent !== null) : [];
      if (!controls.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", closeOnEscape);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".account-overlay .account-close")?.focus());
    const refresh = () => {
      setLocaleRevision((revision) => revision + 1);
      void getCloudAccount().then(applyAccount);
    };
    void getCloudAccount().then(applyAccount);
    window.addEventListener("healthmate:locale", refresh);
    const syncNotice = (event: Event) => {
      const detail = (event as CustomEvent<"synced" | "failed" | "account-mismatch" | "offline">).detail;
      const key = detail === "synced" ? "cloudSynced" : detail === "account-mismatch" ? "cloudAccountMismatch" : detail === "offline" ? "cloudOffline" : (getLastCloudErrorKey() ?? "cloudSyncFailed");
      setMessage(t(key));
      void getCloudAccount().then(setAccount);
    };
    window.addEventListener("healthmate:cloud-sync-status", syncNotice);
    return () => {
      window.removeEventListener("healthmate:locale", refresh);
      window.removeEventListener("healthmate:cloud-sync-status", syncNotice);
      window.removeEventListener("keydown", closeOnEscape);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(t("cloudConnecting"));
    try {
      if (mode === "signIn") {
        const result = await signIn(email.trim(), password);
        if (!result.ok) { setMessage(t(result.errorKey ?? "cloudAuthFailed")); return; }
      } else {
        const result = await signUp(email.trim(), password);
        if (!result.ok) { setMessage(t(result.errorKey ?? "cloudAuthFailed")); return; }
        if (result.confirmationRequired) { setMessage(t("cloudCheckEmail")); return; }
      }
      applyAccount(await getCloudAccount());
      setMessage(t("cloudConsentNeeded"));
      // لو المستخدم وافق على المزامنة قبل كده، تقدمه بيرجع لوحده من غير ما يدوس أي حاجة.
      const status = await autoSyncAfterSignIn();
      if (status) {
        setMessage(t(statusKey(status)));
        setAccount(await getCloudAccount());
      }
    } catch {
      setMessage(t("cloudAuthFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function startGoogleSignIn() {
    setBusy(true);
    const started = await signInWithGoogle();
    if (!started.ok) setMessage(t(started.errorKey ?? "cloudGoogleSetup"));
    setBusy(false);
  }

  async function sendResetLink() {
    if (!email.trim()) { setMessage(t("cloudCredentialsRequired")); return; }
    setBusy(true);
    const reset = await resetPassword(email.trim());
    setMessage(reset.ok ? t("cloudResetSent") : t(reset.errorKey ?? "cloudAuthFailed"));
    setBusy(false);
  }

  async function saveNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const updated = await updatePassword(password);
    setMessage(t(updated.ok ? "cloudPasswordUpdated" : (updated.errorKey ?? "cloudAuthFailed")));
    if (updated.ok) {
      setResetFlow(false);
      setPassword("");
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
    setBusy(false);
  }

  async function syncData() {
    if (!consent) { setMessage(t("cloudConsentNeeded")); return; }
    setCloudSyncConsent(true);
    setBusy(true);
    setMessage(t("cloudSyncing"));
    const result = await syncSignedInAccount(consent);
    setMessage(t(statusKey(result)));
    setAccount(await getCloudAccount());
    setBusy(false);
  }

  async function chooseMismatch(choice: "load" | "merge") {
    if (choice === "load" && !window.confirm(t("cloudMismatchLoadConfirm"))) return;
    setBusy(true);
    setMessage(t("cloudSyncing"));
    const result = await resolveAccountMismatch(choice);
    setMessage(t(statusKey(result)));
    setAccount(await getCloudAccount());
    setBusy(false);
  }

  function showProgress() {
    onClose();
    window.dispatchEvent(new CustomEvent("healthmate:navigate", { detail: "progress" }));
  }

  async function leaveAccount() {
    // تأكيد: الخروج مش "إغلاق" النافذة. التقدم بيفضل على الجهاز، وبيرجع من الحساب لما تسجّل تاني.
    if (!window.confirm(t("signOutConfirm"))) return;
    setBusy(true);
    await disablePush();
    const success = await signOut();
    setAccount(await getCloudAccount());
    setMessage(success ? t("cloudSignedOut") : t("cloudAuthFailed"));
    setBusy(false);
  }

  async function deleteAccount() {
    if (!window.confirm(t("deleteAccountConfirm"))) return;
    setBusy(true);
    await disablePush();
    const success = await deleteAccountAndData();
    if (success) {
      store.clearAll(); // الحساب والسحابة اتمسحوا، ونمسح الجهاز كمان عشان مفيش بيانات تفضل
      window.location.reload();
      return;
    }
    setMessage(t("deleteAccountFailed"));
    setBusy(false);
  }

  return (
    <div className="account-overlay" role="dialog" aria-modal="true" aria-labelledby="account-title">
      <button className="account-close icon-btn" type="button" onClick={onClose} aria-label={t("closeAccount")} title={t("closeAccount")}><X size={20} /></button>
      <div className="account-layout">
        <section className="account-form-side">
          <div className="account-form-content">
            <a className="brand account-brand" href="#" onClick={(event) => event.preventDefault()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2.2-6L13 18l2.2-6H21" /></svg><span>HEALTHMATE</span></a>
            {!account.configured ? (
              <div className="account-setup-note"><ShieldCheck size={22} /><p>{t("cloudSetupNeeded")}</p></div>
            ) : resetFlow ? (
              <div className="account-authenticated">
                <p className="eyebrow">{t("accountEyebrow")}</p>
                <h1 id="account-title">{t("resetPassword")}</h1>
                <form className="account-form" onSubmit={(event) => void saveNewPassword(event)}>
                  <label className="account-field"><span>{t("newPassword")}</span><input autoComplete="new-password" minLength={8} required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
                  <button className="account-primary" type="submit" disabled={busy}>{t("save")}</button>
                </form>
                <p className="account-message" role="status" aria-live="polite">{message}</p>
              </div>
            ) : account.email ? (
              <div className="account-authenticated">
                <p className="eyebrow">{t("cloudAccountTitle")}</p>
                <h1 id="account-title">{t("accountWelcomeBack")}</h1>
                <p className="account-email">{account.email}</p>
                {account.deviceLinkedElsewhere ? (
                  <div className="account-mismatch" role="alert">
                    <p>{t("cloudAccountMismatch")}</p>
                    <button className="account-primary" type="button" onClick={() => void chooseMismatch("load")} disabled={busy}>{t("cloudMismatchLoad")}</button>
                    <button className="account-secondary" type="button" onClick={() => void chooseMismatch("merge")} disabled={busy}>{t("cloudMismatchMerge")}</button>
                  </div>
                ) : (
                  <>
                    <p className="account-status">{account.lastSyncAt ? t("cloudLastSync", { time: new Date(account.lastSyncAt).toLocaleString(getLocale() === "ar" ? "ar-EG" : "en-GB", { dateStyle: "medium", timeStyle: "short" }) }) : t("cloudNeverSynced")}</p>
                    <details className="account-privacy-details"><summary>{t("dataSharingDetails")}</summary><p>{t("cloudLocalDataDetails")}</p><p>{t("cloudUploadedDataDetails")}</p><p>{t("cloudAssistantDataDetails")}</p></details>
                    <label className="cloud-consent"><input type="checkbox" checked={consent} onChange={(event) => { setConsent(event.target.checked); setCloudSyncConsent(event.target.checked); }} /><span>{t("cloudDataConsent")}</span></label>
                    <button className="account-primary" type="button" onClick={() => void syncData()} disabled={busy || !consent}><CloudUpload size={18} />{t("cloudSyncNow")}</button>
                  </>
                )}
                <button className="account-secondary" type="button" onClick={showProgress}><LineChart size={18} />{t("accountViewProgress")}</button>
                <p className="account-message" role="status" aria-live="polite">{message || (consent || account.deviceLinkedElsewhere ? "" : t("cloudConsentNeeded"))}</p>
                <div className="account-footer-actions">
                  <button className="account-text-button" type="button" onClick={() => void leaveAccount()} disabled={busy}>{t("accountSignOut")}</button>
                  <button className="account-text-button account-danger-link" type="button" onClick={() => void deleteAccount()} disabled={busy}>{t("deleteAccount")}</button>
                </div>
              </div>
            ) : (
              <>
                <p className="eyebrow">{t("accountEyebrow")}</p>
                <h1 id="account-title">{mode === "signIn" ? t("accountSignInTitle") : t("accountSignUpTitle")}</h1>
                <p className="account-description">{t("accountDescription")}</p>
                <form className="account-form" onSubmit={(event) => void submit(event)}>
                  <label className="account-field"><span>{t("emailAddress")}</span><input autoComplete="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></label>
                  <label className="account-field"><span>{t("accountPassword")}</span><div className="password-field"><input autoComplete={mode === "signIn" ? "current-password" : "new-password"} minLength={8} required type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? t("hidePassword") : t("showPassword")}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
                  {mode === "signIn" && <button className="account-text-button reset-link" type="button" onClick={() => void sendResetLink()}>{t("resetPassword")}</button>}
                  <button className="account-primary" type="submit" disabled={busy}>{t(mode === "signIn" ? "accountSignIn" : "accountSignUp")}</button>
                </form>
                {googleAuthEnabled && <>
                  <div className="account-divider"><span>{t("accountOr")}</span></div>
                  <button className="account-secondary google-button" type="button" onClick={() => void startGoogleSignIn()} disabled={busy}><GoogleIcon />{t("googleSignIn")}</button>
                </>}
                <p className="account-switch">{t(mode === "signIn" ? "noAccountYet" : "alreadyHaveAccount")} <button className="account-text-button" type="button" onClick={() => { setMode(mode === "signIn" ? "signUp" : "signIn"); setMessage(""); }}>{t(mode === "signIn" ? "accountSignUp" : "accountSignIn")}</button></p>
                <p className="account-message" role="status" aria-live="polite">{message}</p>
                <p className="account-privacy"><ShieldCheck size={16} />{t("accountPrivacyNote")}</p>
              </>
            )}
          </div>
        </section>
        <aside className="account-hero" aria-label={t("accountHeroTitle")}>
          <span className="account-hero-orb account-hero-orb-a" aria-hidden="true" />
          <span className="account-hero-orb account-hero-orb-b" aria-hidden="true" />
          <div className="account-hero-copy">
            <span className="account-hero-mark"><Activity size={20} /></span>
            <p className="eyebrow">HEALTHMATE</p>
            <h2>{t("accountHeroTitle")}</h2>
            <p>{t("accountHeroDescription")}</p>
            <ul className="account-hero-points">
              <li><Dumbbell size={18} aria-hidden="true" /><span>{t("accountHeroPoint1")}</span></li>
              <li><Bell size={18} aria-hidden="true" /><span>{t("accountHeroPoint2")}</span></li>
              <li><CloudUpload size={18} aria-hidden="true" /><span>{t("accountHeroPoint3")}</span></li>
            </ul>
            <small><ShieldCheck size={15} aria-hidden="true" />{t("accountHeroPrivacy")}</small>
          </div>
        </aside>
      </div>
    </div>
  );
}

function statusKey(result: "synced" | "failed" | "account-mismatch" | "offline") {
  return result === "synced" ? "cloudSynced" : result === "account-mismatch" ? "cloudAccountMismatch" : result === "offline" ? "cloudOffline" : (getLastCloudErrorKey() ?? "cloudSyncFailed");
}

function GoogleIcon() {
  return <svg className="google-icon" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3A12 12 0 1 1 24 12c3.1 0 5.8 1.2 8 3l5.6-5.6A19.9 19.9 0 1 0 44 24c0-1.3-.1-2.6-.4-3.9Z" /><path fill="#FF3D00" d="M6.3 14.7 12.9 19C14.7 15 18.9 12 24 12c3.1 0 5.8 1.2 8 3l5.6-5.6A19.9 19.9 0 0 0 24 4C16.3 4 9.7 8.3 6.3 14.7Z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.5 5A20 20 0 0 0 24 44Z" /><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3a12 12 0 0 1-4.1 4.6l6.2 5.2C42 34.9 44 30 44 24c0-1.3-.1-2.6-.4-3.9Z" /></svg>;
}
