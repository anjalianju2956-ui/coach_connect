import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { ApiError, apiPost, setAuthToken } from "../lib/api";
import { getSupabase, supabaseConfigured } from "../lib/supabase";
import type { HealthReport } from "../types";

/**
 * Authentication context.
 *
 * Two modes, decided by the BACKEND (never by the frontend):
 *   - "supabase" : phone OTP via Supabase Auth (session token sent to the API)
 *   - "demo"     : no Supabase credentials yet → a clearly-labelled local demo
 *                  passenger so the whole flow stays testable.
 */

export type AuthMode = "loading" | "supabase" | "demo" | "misconfigured";

export interface AuthUser {
  id: string;
  phone: string | null;
  demo: boolean;
}

interface AuthContextValue {
  mode: AuthMode;
  health: HealthReport | null;
  user: AuthUser | null;
  busy: boolean;
  error: string | null;
  otpSentTo: string | null;
  /** Send an OTP to the given phone (Supabase mode only). */
  signInWithPhone: (phoneE164: string) => Promise<void>;
  /** Verify the OTP the passenger received. */
  verifyOtp: (phoneE164: string, token: string) => Promise<void>;
  /** Start the labelled demo session when Supabase is not configured. */
  enterDemoMode: () => void;
  /** Return to the phone-number step (back from the OTP form). */
  clearOtpSent: () => void;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEMO_KEY = "cc_demo_session";

/** Hard caps so no auth request can ever freeze the app on the spinner. */
const HEALTH_TIMEOUT_MS = 6000;
const SESSION_TIMEOUT_MS = 6000;
const OTP_REQUEST_TIMEOUT_MS = 30000;

const MISCONFIGURED_HINT =
  "The server expects Supabase auth, but client/.env is missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy client/.env.example to client/.env and fill in your project values.";

/** Rejects when `promise` does not settle within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(message));
      },
    );
  });
}

/** Loads /api/health; always resolves (null when unreachable/invalid). */
async function fetchHealthReport(signal: AbortSignal): Promise<HealthReport | null> {
  try {
    const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
    const response = await fetch(`${base}/api/health`, {
      signal,
      headers: { accept: "application/json" },
    });
    const payload = (await response.json()) as { ok: true; data: HealthReport } | { ok: false };
    return payload.ok ? payload.data : null;
  } catch {
    // Backend unreachable or it answered with a non-JSON body: fall back to
    // the client-side configuration instead of blocking the login page.
    return null;
  }
}

function readDemoSession(): AuthUser | null {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { demo: boolean; userId: string };
    if (!parsed?.demo) return null;
    return { id: parsed.userId, phone: null, demo: true };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AuthMode>("loading");
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const authListenerCleanupRef = useRef<(() => void) | undefined>(undefined);

  /* ------------------------------ boot ------------------------------ */
  useEffect(() => {
    // NOTE: React StrictMode runs this effect twice in development, so the
    // boot must be re-entrant. A "already booted" guard would leave the
    // second (live) run skipped while the first run is cancelled — that is
    // exactly what used to strand the login page on "Checking your session…".
    let cancelled = false;
    const healthController = new AbortController();
    const healthTimer = window.setTimeout(() => healthController.abort(), HEALTH_TIMEOUT_MS);

    /** Leaves the loading state unless this effect run was cancelled. */
    const finish = (next: AuthMode) => {
      if (!cancelled) setMode(next);
    };

    (async () => {
      // 1. Ask the backend which auth mode it expects. Bounded by
      //    HEALTH_TIMEOUT_MS so a dead API cannot hold the login page.
      const report = await fetchHealthReport(healthController.signal);
      if (cancelled) return;
      setHealth(report);

      const supabaseMode =
        (report?.auth ?? (supabaseConfigured() ? "supabase" : "demo")) === "supabase";
      const configured = supabaseConfigured();
      // Mode the login page falls back to if anything below fails — always
      // one that renders a usable login screen.
      const fallbackMode: AuthMode = supabaseMode
        ? configured
          ? "supabase"
          : "misconfigured"
        : "demo";

      try {
        if (!supabaseMode) {
          setAuthToken(null);
          setUser(readDemoSession());
          return;
        }

        if (!configured) {
          setError(MISCONFIGURED_HINT);
          return;
        }

        const supabase = getSupabase();
        if (!supabase) {
          setError(MISCONFIGURED_HINT);
          return;
        }

        // 2. Restore any stored session — bounded so a broken or unreachable
        //    Supabase URL can never leave the app on the spinner.
        let session: Session | null = null;
        try {
          const { data } = await withTimeout(
            supabase.auth.getSession(),
            SESSION_TIMEOUT_MS,
            "Checking your session took too long. Please sign in again.",
          );
          session = data.session;
        } catch (sessionError) {
          if (cancelled) return;
          setError(
            sessionError instanceof Error
              ? sessionError.message
              : "Could not restore your previous session. Please sign in again.",
          );
        }
        if (cancelled) return;
        applySession(session);

        authListenerCleanupRef.current?.();
        const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
          applySession(nextSession);
        });
        authListenerCleanupRef.current = () => listener.subscription.unsubscribe();
        if (cancelled) {
          authListenerCleanupRef.current?.();
          authListenerCleanupRef.current = undefined;
        }
      } catch (error) {
        // 3. Any unexpected failure still lands on the login page.
        if (cancelled) return;
        setAuthToken(null);
        setUser(null);
        setError(
          error instanceof Error && error.message
            ? error.message
            : "Could not restore your previous session. Please sign in again.",
        );
      } finally {
        // Guarantees the app never stays in "loading".
        finish(fallbackMode);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(healthTimer);
      healthController.abort();
      authListenerCleanupRef.current?.();
      authListenerCleanupRef.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applySession(session: Session | null) {
    setAuthToken(session?.access_token ?? null);
    if (session?.user) {
      setUser({
        id: session.user.id,
        phone: session.user.phone ?? null,
        demo: false,
      });
    } else {
      setUser(null);
    }
  }

  /* --------------------------- actions --------------------------- */

  const signInWithPhone = useCallback(async (phoneE164: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      setError("Supabase is not configured on this client.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: otpError } = await withTimeout(
        supabase.auth.signInWithOtp({
          phone: phoneE164,
          options: { channel: "sms" },
        }),
        OTP_REQUEST_TIMEOUT_MS,
        "Sending the OTP took too long. Please check your connection and try again.",
      );
      if (otpError) throw new Error(otpError.message);
      setOtpSentTo(phoneE164);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the OTP.");
    } finally {
      setBusy(false);
    }
  }, []);

  const verifyOtp = useCallback(async (phoneE164: string, token: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      setError("Supabase is not configured on this client.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data, error: verifyError } = await withTimeout(
        supabase.auth.verifyOtp({
          phone: phoneE164,
          token: token.trim(),
          type: "sms",
        }),
        OTP_REQUEST_TIMEOUT_MS,
        "Verifying the OTP took too long. Please check your connection and try again.",
      );
      if (verifyError) throw new Error(verifyError.message);
      applySession(data.session);
      setOtpSentTo(null);
      // Best-effort profile creation — ignore failures (e.g. offline).
      try {
        await withTimeout(
          apiPost("/profile", { phone: phoneE164 }),
          SESSION_TIMEOUT_MS,
          "Profile creation timed out.",
        );
      } catch {
        /* non-fatal */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid OTP. Please try again.");
      throw err instanceof Error ? err : new Error("Invalid OTP");
    } finally {
      setBusy(false);
    }
  }, []);

  const enterDemoMode = useCallback(() => {
    const demo: AuthUser = { id: "demo-passenger", phone: null, demo: true };
    localStorage.setItem(
      DEMO_KEY,
      JSON.stringify({ demo: true, userId: demo.id, createdAt: Date.now() }),
    );
    setAuthToken(null);
    setUser(demo);
    setError(null);
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (supabase && mode === "supabase") {
      await supabase.auth.signOut();
    }
    localStorage.removeItem(DEMO_KEY);
    setAuthToken(null);
    setUser(null);
    setOtpSentTo(null);
    setError(null);
  }, [mode]);

  const value = useMemo<AuthContextValue>(
    () => ({
      mode,
      health,
      user,
      busy,
      error,
      otpSentTo,
      signInWithPhone,
      verifyOtp,
      enterDemoMode,
      clearOtpSent: () => setOtpSentTo(null),
      signOut,
      clearError: () => setError(null),
    }),
    [mode, health, user, busy, error, otpSentTo, signInWithPhone, verifyOtp, enterDemoMode, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Helper used by pages that must not render before boot completes. */
export function useHealth(): HealthReport | null {
  return useAuth().health;
}

export { ApiError };
