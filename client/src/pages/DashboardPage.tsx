import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useJourney } from "../context/JourneyContext";
import { useGeolocation } from "../hooks/useGeolocation";
import { useToast } from "../context/ToastContext";
import { apiGet, ApiError } from "../lib/api";
import { timeAgo } from "../lib/format";
import type { NextStationResponse } from "../types";
import { Banner, Button } from "../components/ui/Button";
import { EmptyState, ErrorState, PageHeader, StallCardSkeleton } from "../components/ui/States";
import { Icon } from "../components/ui/Icon";
import { TrainModeCard, VerificationSignals } from "../components/journey/TrainModeCard";
import { LocationStatus } from "../components/journey/LocationStatus";
import { StallCard } from "../components/stalls/StallCard";

const REFRESH_MS = 60_000;
/** Auto re-verify at most this often (keeps well inside the server rate limit). */
const AUTO_VERIFY_MIN_MS = 45_000;
/** Only bother the server again once the device has really moved. */
const AUTO_VERIFY_MIN_M = 250;

/** Cheap equirectangular distance — good enough for a movement threshold. */
function metersBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

export function DashboardPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { journey, verification, liveTrain, warnings, presentationDemo, endJourney, loadActive, verify } = useJourney();
  const geo = useGeolocation();

  const [data, setData] = useState<NextStationResponse | null>(null);
  const [stallsError, setStallsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const mounted = useRef(true);

  const active = journey && journey.status === "ACTIVE" ? journey : null;
  const verified = Boolean(active && active.verified);

  const fetchStalls = useCallback(
    async (journeyId: string) => {
      setLoading(true);
      setStallsError(null);
      try {
        const result = await apiGet<NextStationResponse>(`/stalls/next-station?journeyId=${encodeURIComponent(journeyId)}`);
        if (!mounted.current) return;
        setData(result);
        setLastSync(new Date().toISOString());
      } catch (err) {
        if (!mounted.current) return;
        if (err instanceof ApiError) setStallsError(err.message);
        else setStallsError("Could not load stalls at your next station.");
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /* Latest verify() always reachable from a timer without re-binding it. */
  const verifyRef = useRef(verify);
  useEffect(() => {
    verifyRef.current = verify;
  }, [verify]);

  /** When the last auto/manual re-verify ran, from where. */
  const lastVerifyRef = useRef<{ at: number; lat: number; lng: number } | null>(null);

  /* Train mode keeps a live GPS watch while the journey is verified, so the
     "Stop tracking" control and the location panel describe reality. */
  useEffect(() => {
    if (verified && !presentationDemo) geo.startWatching();
    else geo.stopWatching();
  }, [verified, presentationDemo, geo.startWatching, geo.stopWatching]);

  useEffect(() => () => geo.stopWatching(), [geo.stopWatching]);

  /* Seed the throttle from the journey itself so opening the dashboard does
     not immediately re-verify a position the server already knows. */
  useEffect(() => {
    if (active && typeof active.last_lat === "number" && typeof active.last_lng === "number") {
      lastVerifyRef.current = {
        at: Date.parse(active.updated_at) || Date.now(),
        lat: active.last_lat,
        lng: active.last_lng,
      };
    } else {
      lastVerifyRef.current = null;
    }
  }, [active?.id, active?.updated_at, active?.last_lat, active?.last_lng]);

  /* Re-run verification only when there is something new to say: the device
     moved far enough AND enough time has passed. A stationary session never
     re-verifies, so a fix that already passed stays passed. */
  const position = geo.state.position;
  useEffect(() => {
    if (!verified || !active || presentationDemo || !position) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

    const last = lastVerifyRef.current;
    if (!last) {
      lastVerifyRef.current = { at: Date.now(), lat: position.lat, lng: position.lng };
      return;
    }
    const now = Date.now();
    if (now - last.at < AUTO_VERIFY_MIN_MS) return;
    if (metersBetween(last, position) < AUTO_VERIFY_MIN_M) return;

    lastVerifyRef.current = { at: now, lat: position.lat, lng: position.lng };
    void verifyRef
      .current(
        { trainNumber: active.train_number, coach: active.coach, location: position },
        { silent: true },
      )
      .catch(() => {
        /* Background refresh: the UI already shows the server's verdict. */
      });
  }, [verified, active, presentationDemo, position]);

  useEffect(() => {
    if (!active?.verified) {
      setData(null);
      setLastSync(null);
      return;
    }
    void fetchStalls(active.id);
    const timer = window.setInterval(() => void fetchStalls(active.id), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [active?.id, active?.verified, active?.next_station_code, fetchStalls]);

  async function handleEnd() {
    try {
      await endJourney();
      toast.push("Journey ended.", "info");
      navigate("/journey");
    } catch {
      /* surfaced in context */
    }
  }

  return (
    <div className="stack">
      <PageHeader
        title="Train mode"
        subtitle={verified ? "Live journey — stalls refresh automatically" : "Verify your journey to unlock stalls"}
      />

      <TrainModeCard journey={active} verification={verification} liveTrain={liveTrain} />

      {warnings.length > 0
        ? warnings.map((w) => (
            <Banner key={w} tone="warn">
              {w}
            </Banner>
          ))
        : null}

      <LocationStatus
        state={geo.state}
        onAllow={() => geo.requestOnce()}
        tracking={geo.watching}
        onStop={() => geo.stopWatching()}
      />

      {verification && active ? <VerificationSignals verification={verification} /> : null}

      {!active ? (
        <div className="card card__pad">
          <EmptyState
            icon="train"
            title="No active journey"
            text="Select your train and coach, then verify to turn train mode on."
            action={
              <Button variant="accent" onClick={() => navigate("/journey")}>
                <Icon name="navigation" size={16} /> Start a journey
              </Button>
            }
          />
        </div>
      ) : !active.verified ? (
        <div className="card card__pad">
          <ErrorState
            title="Journey not verified"
            text={active.verify_reason ?? "We could not confirm that you are travelling on this train."}
            onRetry={() => navigate("/journey")}
          />
        </div>
      ) : (
        <section className="stack stack--sm" aria-label="Stalls at your next station">
          <div className="section-title" style={{ marginBottom: 0 }}>
            <h2>
              {data ? (
                <>
                  Stalls at <span className="mono">{data.station.code}</span> — {data.station.name}
                </>
              ) : (
                "Stalls at your next station"
              )}
            </h2>
            {lastSync ? (
              <span className="score mono" style={{ alignSelf: "flex-end" }}>
                Synced {timeAgo(lastSync)}
              </span>
            ) : null}
          </div>

          {data ? (
            <p className="tiny muted" style={{ margin: 0 }}>
              {data.context.currentStation
                ? `Coming from ${data.context.currentStation} · `
                : ""}
              train {data.context.trainNumber}, coach {data.context.coach}
              {data.context.isApproaching ? " · approaching" : " · currently at"}
            </p>
          ) : null}

          {loading && !data ? (
            <StallCardSkeleton />
          ) : stallsError ? (
            <ErrorState text={stallsError} onRetry={() => active && void fetchStalls(active.id)} />
          ) : data && data.matches.length === 0 ? (
            <div className="card card__pad">
              <EmptyState
                icon="store"
                title="No stalls listed yet"
                text={`No stall data for ${data.station.name}. It refreshes automatically as the train moves.`}
                action={
                  <Button variant="quiet" onClick={() => active && void fetchStalls(active.id)}>
                    <Icon name="refresh" size={15} /> Refresh now
                  </Button>
                }
              />
            </div>
          ) : data ? (
            data.matches.map((match) => <StallCard key={match.stall.id} match={match} journeyId={active!.id} />)
          ) : null}

          <div className="row row--between">
            <Link to="/stalls" className="btn btn--quiet btn--sm">
              See all stalls <Icon name="chevronRight" size={14} />
            </Link>
            <Button variant="quiet" size="sm" onClick={() => active && void fetchStalls(active.id)} loading={loading}>
              <Icon name="refresh" size={14} /> Refresh
            </Button>
          </div>
        </section>
      )}

      {active ? (
        <div className="row row--between" style={{ paddingTop: 4 }}>
          <Button variant="quiet" size="sm" onClick={() => void handleEnd()}>
            End journey
          </Button>
        </div>
      ) : null}
    </div>
  );
}
