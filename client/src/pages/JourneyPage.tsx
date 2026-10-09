import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useJourney } from "../context/JourneyContext";
import { useGeolocation } from "../hooks/useGeolocation";
import { useToast } from "../context/ToastContext";
import { apiGet, ApiError } from "../lib/api";
import { onlyDigits } from "../lib/format";
import type { TrainRoute } from "../types";
import { Banner, Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { PageHeader, Spinner } from "../components/ui/States";
import { Icon } from "../components/ui/Icon";
import { TrainModeCard, VerificationSignals } from "../components/journey/TrainModeCard";
import { LocationStatus } from "../components/journey/LocationStatus";

const COACH_PATTERN = /^[A-Za-z]{1,2}\d{1,3}[A-Za-z]?$/;

export function JourneyPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { health } = useAuth();
  const {
    journey,
    verification,
    liveTrain,
    warnings,
    checking,
    error,
    presentationDemo,
    demoStageIndex,
    verify,
    startPresentationDemo,
    simulatePresentationDemo,
    endJourney,
    clear,
  } = useJourney();
  const geo = useGeolocation();

  const [trainNumber, setTrainNumber] = useState(health?.data.railkit ? "" : "12951");
  const [coach, setCoach] = useState("");
  const [trainError, setTrainError] = useState<string | null>(null);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [route, setRoute] = useState<TrainRoute | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [checkingTrain, setCheckingTrain] = useState(false);

  const active = journey && journey.status === "ACTIVE" ? journey : null;

  /* Keep the form in sync with an already-running journey. */
  useEffect(() => {
    if (active) {
      setTrainNumber(active.train_number);
      setCoach(active.coach);
    }
  }, [active?.id, active?.train_number, active?.coach]);

  async function checkTrain() {
    const value = onlyDigits(trainNumber, 5);
    if (value.length !== 5) {
      setTrainError("Train number must be exactly 5 digits.");
      setRoute(null);
      return;
    }
    setTrainError(null);
    setCheckingTrain(true);
    setRouteError(null);
    try {
      const data = await apiGet<TrainRoute>(`/trains/${value}`);
      setRoute(data);
    } catch (err) {
      setRoute(null);
      setRouteError(err instanceof ApiError ? err.message : "Could not load this train.");
    } finally {
      setCheckingTrain(false);
    }
  }

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    let ok = true;

    if (trainNumber.length !== 5) {
      setTrainError("Train number must be exactly 5 digits.");
      ok = false;
    } else setTrainError(null);

    if (!COACH_PATTERN.test(coach.trim())) {
      setCoachError("Coach must look like S1, B2, A1 or H1.");
      ok = false;
    } else setCoachError(null);

    if (!ok) return;

    if (geo.state.status !== "ready" || !geo.state.position) {
      geo.requestOnce();
      toast.push("Allow location access first — it is required to verify the journey.", "info");
      return;
    }

    try {
      const response = await verify({
        trainNumber,
        coach: coach.trim().toUpperCase(),
        location: geo.state.position,
      });
      if (response.verification.verified) {
        toast.push("Journey verified — train mode is on.", "ok");
      } else {
        toast.push("Journey not verified yet. See the reason below.", "error");
      }
    } catch {
      /* error surfaced through context */
    }
  }

  async function handleStartPresentationDemo() {
    try {
      await startPresentationDemo();
      toast.push("Presentation Demo started at Borivali.", "ok");
    } catch {
      /* error surfaced through context */
    }
  }

  async function handleSimulateJourney() {
    try {
      const response = await simulatePresentationDemo();
      toast.push(
        `Demo train reached ${response.verification.currentStation?.name ?? "the next stage"}.`,
        "ok",
      );
    } catch {
      /* error surfaced through context */
    }
  }

  async function handleEndAndRestart() {
    try {
      await endJourney();
      clear();
      setRoute(null);
      setCoach("");
      toast.push("Journey ended. Start a new one below.", "info");
    } catch {
      /* surfaced via context */
    }
  }

  return (
    <div className="stack">
      <PageHeader
        title={active ? "Journey in progress" : "Start a journey"}
        subtitle={active ? "Update your location to refresh verification" : "Train + coach + GPS are verified on the server"}
      />

      <TrainModeCard journey={active} verification={verification} liveTrain={liveTrain} />

      {warnings.length > 0 ? (
        <div className="stack stack--sm">
          {warnings.map((w) => (
            <Banner key={w} tone="warn">
              {w}
            </Banner>
          ))}
        </div>
      ) : null}

      {verification && active ? <VerificationSignals verification={verification} /> : null}

      {presentationDemo ? (
        <div className="card card__pad stack stack--sm">
          <Banner tone="warn" title="DEMO LOCATION — Presentation Demo">
            This simulation uses seeded train coordinates, not your device GPS. Train 12951 · Coach S1.
            {active?.current_station_name ? ` Current simulated stop: ${active.current_station_name}.` : ""}
          </Banner>
          {demoStageIndex !== null && demoStageIndex < 3 ? (
            <Button variant="accent" block loading={checking} onClick={() => void handleSimulateJourney()}>
              <Icon name="navigation" size={15} /> Simulate Journey
            </Button>
          ) : (
            <p className="tiny muted" style={{ margin: 0 }}>
              The presentation simulation has reached its final seeded stop. End this journey to start it again.
            </p>
          )}
        </div>
      ) : (
        <>
          <LocationStatus
            state={geo.state}
            onAllow={() => geo.requestOnce()}
            tracking={geo.watching}
            onStop={() => geo.stopWatching()}
          />
          {health?.data.demoData ? (
            <div className="card card__pad stack stack--sm">
              <Banner tone="info" title="Presentation Demo">
                Run the seeded 12951 / S1 journey without using your physical location.
              </Banner>
              <Button variant="accent" block loading={checking} onClick={() => void handleStartPresentationDemo()}>
                <Icon name="train" size={15} /> Start Presentation Demo
              </Button>
            </div>
          ) : null}
        </>
      )}

      <form className="card card__pad stack" onSubmit={handleVerify} noValidate>
        <div className="row row--between">
          <h2 style={{ fontSize: "0.95rem" }}>Journey details</h2>
          {route ? (
            <span className={`badge ${route.source === "demo" ? "badge--demo" : "badge--info"}`}>
              {route.source === "demo" ? "Demo route data" : "RailKit live"}
            </span>
          ) : null}
        </div>

        <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <Field
              label="Train number"
              inputMode="numeric"
              placeholder="12951"
              value={trainNumber}
              onChange={(e) => setTrainNumber(onlyDigits(e.target.value, 5))}
              error={trainError}
              maxLength={5}
            />
          </div>
          <div style={{ width: 110 }}>
            <Field
              label="Coach"
              placeholder="S1"
              autoCapitalize="characters"
              value={coach}
              onChange={(e) => setCoach(e.target.value.toUpperCase().slice(0, 6))}
              error={coachError}
              hint="S1, B2, A1…"
            />
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          onClick={() => void checkTrain()}
          loading={checkingTrain}
          icon="search"
        >
          {route ? "Refresh train" : "Check train"}
        </Button>

        {checkingTrain ? <Spinner label="Loading train route…" /> : null}

        {routeError ? <Banner tone="danger" title="Train not found">{routeError}</Banner> : null}

        {route ? (
          <div className="card card--inset" style={{ display: "grid", gap: 6 }}>
            <div className="row row--between">
              <span className="strong">{route.trainName}</span>
              <span className="mono muted">{route.trainNumber}</span>
            </div>
            <div className="tiny muted">
              {route.originCode && route.destinationCode
                ? `${route.originCode} → ${route.destinationCode} · ${route.stations.length} stoppages`
                : `${route.stations.length} stoppages`}
            </div>
            {route.liveTrain ? (
              <div className="tiny stack stack--xs" style={{ marginTop: 6 }}>
                <div className="strong">
                  {route.liveTrain.source} TRAIN DATA
                  {route.liveTrain.source === "RAILKIT" ? (route.liveTrain.cached ? " · cached" : " · updated") : " · presentation fallback"}
                </div>
                <div>
                  {route.liveTrain.currentLocation?.name ?? "Current location unavailable"}
                  {" → "}
                  {route.liveTrain.nextStation?.name ?? "Next station unavailable"}
                  {route.liveTrain.distanceToNextStationKm !== null
                    ? ` · ${route.liveTrain.distanceToNextStationKm} km`
                    : ""}
                </div>
                <div>
                  Delay: {route.liveTrain.delayMinutes === null ? "—" : `${route.liveTrain.delayMinutes} min`}
                  {" · "}
                  Speed: {route.liveTrain.speedKmph === null ? "—" : `${route.liveTrain.speedKmph} km/h`}
                </div>
              </div>
            ) : null}
            {!health?.data.railkit ? (
              <div className="tiny" style={{ color: "var(--warn)" }}>
                Live railway data is switched off — only the demo route (train 12951) can be verified right now.
              </div>
            ) : null}
          </div>
        ) : null}

        {!health?.data.railkit && !route ? (
          <p className="tiny muted" style={{ margin: 0 }}>
            Tip: type <strong>12951</strong> to use the built-in demo route.
          </p>
        ) : null}

        {error ? <Banner tone="danger" title="Verification failed">{error}</Banner> : null}

        <Button type="submit" block size="lg" loading={checking} icon="shield">
          {active ? "Re-verify journey" : "Verify journey"}
        </Button>

        <p className="tiny muted" style={{ margin: 0, textAlign: "center" }}>
          Verification runs on the Coach-Connect server. Your GPS fix is only sent to it.
        </p>
      </form>

      {active ? (
        <div className="row" style={{ gap: 10 }}>
          <Button variant="accent" block onClick={() => navigate("/dashboard")}>
            Open train mode dashboard
          </Button>
          <Button variant="quiet" onClick={() => void handleEndAndRestart()}>
            End journey
          </Button>
        </div>
      ) : verification && !verification.verified ? (
        <div className="card card__pad row row--between" style={{ gap: 12 }}>
          <div>
            <div className="strong">Not verified</div>
            <div className="tiny muted">You can retry as many times as you like.</div>
          </div>
          <Icon name="info" size={18} />
        </div>
      ) : null}
    </div>
  );
}
