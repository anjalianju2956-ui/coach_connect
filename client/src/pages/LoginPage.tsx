import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { AuthMode } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Banner, Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { PageHeader, Spinner } from "../components/ui/States";
import { Icon } from "../components/ui/Icon";
import { normalisePhone, onlyDigits } from "../lib/format";
import { supabaseConfigured } from "../lib/supabase";

/** Never sit on "Checking your session…" for longer than this. */
const SESSION_CHECK_TIMEOUT_MS = 8000;

/**
 * Passenger authentication.
 *  - Supabase mode: phone number → OTP → session
 *  - Demo mode: one clearly-labelled local session (no Supabase account yet)
 *
 * The page always resolves to a usable screen:
 *  - session still loading  → spinner (bounded by SESSION_CHECK_TIMEOUT_MS)
 *  - signed in              → redirect to `next` (default /journey)
 *  - signed out             → the login / OTP form
 *  - Supabase not configured→ the login page with a clear warning
 */
export function LoginPage() {
  const { mode, user, error, busy, otpSentTo, signInWithPhone, verifyOtp, enterDemoMode, clearOtpSent, clearError } =
    useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const toast = useToast();

  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [sessionTimedOut, setSessionTimedOut] = useState(false);

  const redirectTo =
    params.get("next") ||
    (location.state as { from?: string } | null)?.from ||
    "/journey";

  /* Safety net: if the auth boot hangs, stop spinning and show the form. */
  useEffect(() => {
    if (mode !== "loading") return;
    const timer = window.setTimeout(() => setSessionTimedOut(true), SESSION_CHECK_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [mode]);

  const ready = mode !== "loading" || sessionTimedOut;
  const effectiveMode: AuthMode =
    mode === "loading" ? (supabaseConfigured() ? "supabase" : "demo") : mode;

  /* Already signed in → continue to where the passenger was heading. */
  useEffect(() => {
    if (!ready || !user) return;
    if (redirectTo === location.pathname) return;
    navigate(redirectTo, { replace: true });
  }, [ready, user, redirectTo, location.pathname, navigate]);

  const handleSend = async (event: FormEvent) => {
    event.preventDefault();
    const { e164, error: validation } = normalisePhone(phone);
    setPhoneError(validation);
    if (validation) return;
    await signInWithPhone(e164);
  };

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault();
    if (otp.trim().length < 4) {
      setOtpError("Enter the 4–6 digit code from the SMS.");
      return;
    }
    setOtpError(null);
    try {
      await verifyOtp(otpSentTo ?? "", otp);
      toast.push("Signed in successfully.", "ok");
      navigate(redirectTo, { replace: true });
    } catch {
      setOtpError("That code did not work. Check the SMS and try again.");
    }
  };

  const form = !otpSentTo ? (
    <form className="card card__pad stack" onSubmit={handleSend} noValidate>
      <div className="field">
        <label className="field__label" htmlFor="phone">Mobile number</label>
        <div className="input-group">
          <span className="input-prefix">+91</span>
          <input
            id="phone"
            className={`input ${phoneError ? "input--invalid" : ""}`}
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => setPhone(onlyDigits(e.target.value, 10))}
            aria-invalid={Boolean(phoneError)}
          />
        </div>
        {phoneError ? (
          <span className="field__error" role="alert">{phoneError}</span>
        ) : (
          <span className="field__hint">Indian mobile numbers only, for now.</span>
        )}
      </div>

      <Button type="submit" block size="lg" loading={busy}>
        Send OTP
      </Button>
    </form>
  ) : (
    <form className="card card__pad stack" onSubmit={handleVerify} noValidate>
      <Field
        label="One-time password"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123456"
        maxLength={6}
        className="input--num"
        value={otp}
        onChange={(e) => setOtp(onlyDigits(e.target.value, 6))}
        error={otpError}
        hint="Enter the code you received by SMS."
      />
      <Button type="submit" block size="lg" loading={busy}>
        Verify &amp; continue
      </Button>
      <Button
        type="button"
        variant="ghost"
        block
        onClick={() => { clearOtpSent(); setOtp(""); setOtpError(null); clearError(); }}
      >
        Use a different number
      </Button>
    </form>
  );

  if (!ready) {
    return <Spinner label="Checking your session…" />;
  }

  /* ---------------------- signed in → redirect ---------------------- */
  if (user) {
    // The effect above navigates away; only render the interstitial when
    // there is nowhere else to redirect to (target is this very page).
    if (redirectTo !== location.pathname) {
      return <Spinner label="Taking you to your journey…" />;
    }
    return (
      <div className="stack">
        <PageHeader title="You are signed in" />
        <Banner tone="ok" title={user.demo ? "Demo session active" : "Signed in"}>
          {user.demo
            ? "You are using the local demo passenger. Configure Supabase to enable phone OTP login."
            : `Signed in as ${user.phone ?? "your account"}.`}
        </Banner>
        <Button block onClick={() => navigate(redirectTo)}>
          Continue <Icon name="chevronRight" size={16} />
        </Button>
      </div>
    );
  }

  /* ------------- Supabase expected but not configured on the client ------------- */
  if (effectiveMode === "misconfigured") {
    return (
      <div className="stack">
        <PageHeader title="Sign in with your phone" subtitle="Supabase is not configured on this client" />

        <Banner tone="danger" title="Phone sign-in is unavailable">
          {error ?? "Supabase environment variables are missing on the frontend."}
          {error ? (
            <div style={{ marginTop: 6 }}>
              <button type="button" className="btn btn--quiet btn--sm" onClick={clearError}>
                Dismiss
              </button>
            </div>
          ) : null}
        </Banner>

        {form}

        <div className="card card__pad stack stack--sm">
          <div className="strong">Explore without phone OTP</div>
          <p className="tiny muted" style={{ margin: 0 }}>
            Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to client/.env to enable SMS login.
            Until then you can continue with a local demo passenger.
          </p>
          <Button variant="ghost" block onClick={() => { enterDemoMode(); navigate(redirectTo); }}>
            Continue in demo mode
          </Button>
        </div>
      </div>
    );
  }

  /* ------------------------- demo mode ------------------------- */
  if (effectiveMode === "demo") {
    return (
      <div className="stack">
        <PageHeader title="Passenger login" subtitle="No Supabase credentials detected" />

        <Banner tone="demo" title="Demo mode">
          The backend is running without Supabase, so phone OTP is disabled. You can continue with a local
          demo passenger to verify a journey and browse stalls, menus and prices.
        </Banner>

        <div className="card card__pad stack stack--sm">
          <div className="strong">What you can do now</div>
          <ul className="tiny muted" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
            <li>Verify a demo journey (train 12951 has a built-in demo route).</li>
            <li>Browse DEMO stalls at the next station.</li>
            <li>View stall menus, item availability and prices.</li>
          </ul>
          <Button block size="lg" onClick={() => { enterDemoMode(); navigate(redirectTo); }}>
            Continue in demo mode
          </Button>
        </div>

        <div className="card card__pad stack stack--sm">
          <div className="strong">Enable real phone OTP later</div>
          <ol className="tiny muted" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
            <li>Create a Supabase project and enable the Phone provider.</li>
            <li>Copy client/.env.example to client/.env and add VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.</li>
            <li>Add the same values to your server .env (SUPABASE_URL, SUPABASE_ANON_KEY).</li>
            <li>Run supabase/migrations/*.sql, then restart both servers.</li>
          </ol>
        </div>
      </div>
    );
  }

  /* --------------------- supabase phone OTP --------------------- */
  return (
    <div className="stack">
      <PageHeader
        title={otpSentTo ? "Enter OTP" : "Sign in with your phone"}
        subtitle={otpSentTo ? `Code sent to ${otpSentTo}` : "We will text you a one-time password"}
      />

      {error ? (
        <div className="banner-slot">
          <Banner tone="danger" title="Could not sign in">
            {error}
            <div style={{ marginTop: 6 }}>
              <button type="button" className="btn btn--quiet btn--sm" onClick={clearError}>
                Dismiss
              </button>
            </div>
          </Banner>
        </div>
      ) : null}

      {form}
    </div>
  );
}
