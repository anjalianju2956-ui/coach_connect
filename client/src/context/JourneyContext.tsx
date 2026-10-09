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
import { apiGet, apiPost, ApiError } from "../lib/api";
import { useAuth } from "./AuthContext";
import type { Journey, LiveTrainData, LocationSample, VerificationResult, VerifyResponse } from "../types";

/**
 * Journey state: the verified (or unverified) train journey for this session.
 *
 * Verification always runs on the server — the client only sends the raw
 * inputs (train, coach, GPS) and never decides "verified" by itself.
 */

interface JourneyContextValue {
  journey: Journey | null;
  verification: VerificationResult | null;
  liveTrain: LiveTrainData | null;
  warnings: string[];
  presentationDemo: boolean;
  demoStageIndex: number | null;
  /** true while a verify call is in flight */
  checking: boolean;
  /** true while the stored active journey is being restored */
  restoring: boolean;
  error: string | null;
  loadActive: () => Promise<void>;
  verify: (
    input: {
      trainNumber: string;
      coach: string;
      location?: LocationSample;
    },
    options?: {
      /**
       * Background refresh: the verdict still lands in state, but transport
       * failures are not surfaced as a sticky error banner.
       */
      silent?: boolean;
      presentationDemo?: boolean;
      demoStageIndex?: number;
    },
  ) => Promise<VerifyResponse>;
  startPresentationDemo: () => Promise<VerifyResponse>;
  simulatePresentationDemo: () => Promise<VerifyResponse>;
  endJourney: () => Promise<void>;
  clear: () => void;
}

const JourneyContext = createContext<JourneyContextValue | null>(null);

function stageIndexFromJourney(journey: Journey | null): number | null {
  const match = journey?.verify_reason?.match(/DEMO_SIMULATION:stage=(\d+)/);
  return match ? Number(match[1]) : null;
}

export function JourneyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [journey, setJourney] = useState<Journey | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [liveTrain, setLiveTrain] = useState<LiveTrainData | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoStageIndex, setDemoStageIndex] = useState<number | null>(null);
  const journeyRevision = useRef(0);
  const presentationDemo = Boolean(
    journey?.status === "ACTIVE" &&
      journey.verified &&
      journey.verify_reason?.startsWith("DEMO_VERIFIED: DEMO_SIMULATION:"),
  );

  const loadActive = useCallback(async () => {
    if (!user) return;
    const revision = journeyRevision.current;
    setRestoring(true);
    setError(null);
    try {
      const data = await apiGet<{ journey: Journey | null }>("/journey/active");
      if (revision !== journeyRevision.current) return;
      setJourney(data.journey);
      setDemoStageIndex(stageIndexFromJourney(data.journey));
      setLiveTrain(null);
      if (!data.journey) setVerification(null);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setError(err.message);
      }
    } finally {
      setRestoring(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      void loadActive();
    } else {
      journeyRevision.current += 1;
      setJourney(null);
      setVerification(null);
      setLiveTrain(null);
      setDemoStageIndex(null);
      setWarnings([]);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const verify = useCallback(
    async (
      input: { trainNumber: string; coach: string; location?: LocationSample },
      options?: { silent?: boolean; presentationDemo?: boolean; demoStageIndex?: number },
    ) => {
      journeyRevision.current += 1;
      setChecking(true);
      if (!options?.silent) setError(null);
      try {
        const data = await apiPost<VerifyResponse>("/journey/verify", {
          trainNumber: input.trainNumber,
          coach: input.coach,
          ...(input.location ? { location: input.location } : {}),
          ...(options?.presentationDemo
            ? { presentationDemo: true, demoStage: options.demoStageIndex }
            : {}),
          journeyId: journey?.id,
        });
        setJourney(data.journey);
        setLiveTrain(data.liveTrain ?? null);
        setDemoStageIndex(stageIndexFromJourney(data.journey));
        setVerification(data.verification);
        setWarnings(data.verification.warnings ?? []);
        return data;
      } catch (err) {
        // A background refresh must not pop an error banner the user did not
        // ask for; the previous verdict stays on screen until it succeeds.
        if (!options?.silent) {
          const message = err instanceof ApiError ? err.message : "Journey verification failed.";
          setError(message);
        }
        throw err instanceof Error ? err : new Error("Journey verification failed.");
      } finally {
        setChecking(false);
      }
    },
    [journey?.id],
  );

  const startPresentationDemo = useCallback(
    () =>
      verify(
        { trainNumber: "12951", coach: "S1" },
        { presentationDemo: true, demoStageIndex: 0 },
      ),
    [verify],
  );

  const simulatePresentationDemo = useCallback(() => {
    const nextStage = Math.min((demoStageIndex ?? -1) + 1, 3);
    return verify(
      { trainNumber: "12951", coach: "S1" },
      { presentationDemo: true, demoStageIndex: nextStage },
    );
  }, [demoStageIndex, verify]);

  const endJourney = useCallback(async () => {
    if (!journey) return;
    journeyRevision.current += 1;
    try {
      await apiPost(`/journey/${journey.id}/end`);
      setJourney({ ...journey, status: "ENDED", ended_at: new Date().toISOString() });
      setVerification(null);
      setLiveTrain(null);
      setWarnings([]);
      setDemoStageIndex(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not stop the journey.";
      setError(message);
      throw err instanceof Error ? err : new Error(message);
    }
  }, [journey]);

  const clear = useCallback(() => {
    journeyRevision.current += 1;
    setJourney(null);
    setVerification(null);
    setLiveTrain(null);
    setWarnings([]);
    setError(null);
    setDemoStageIndex(null);
  }, []);

  const value = useMemo<JourneyContextValue>(
    () => ({
      journey,
      verification,
      liveTrain,
      warnings,
      presentationDemo,
      demoStageIndex,
      checking,
      restoring,
      error,
      loadActive,
      verify,
      startPresentationDemo,
      simulatePresentationDemo,
      endJourney,
      clear,
    }),
    [
      journey,
      verification,
      liveTrain,
      warnings,
      presentationDemo,
      demoStageIndex,
      checking,
      restoring,
      error,
      loadActive,
      verify,
      startPresentationDemo,
      simulatePresentationDemo,
      endJourney,
      clear,
    ],
  );

  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>;
}

export function useJourney(): JourneyContextValue {
  const ctx = useContext(JourneyContext);
  if (!ctx) throw new Error("useJourney must be used inside <JourneyProvider>");
  return ctx;
}

/** Convenience: is there a usable, verified journey right now? */
export function useVerifiedJourney(): Journey | null {
  const { journey } = useJourney();
  return journey && journey.status === "ACTIVE" && journey.verified ? journey : null;
}
