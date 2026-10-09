import { Icon } from "../ui/Icon";
import { Badge } from "../ui/Button";
import { formatMinutes, percent } from "../../lib/format";
import type { Journey, LiveTrainData, VerificationResult } from "../../types";

function displayPosition(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.length ? `${value.length} route stops` : "Not available";
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const name = record.name ?? record.stationName ?? record.station_name;
    const code = record.code ?? record.stationCode ?? record.station_code;
    if (typeof name === "string" && typeof code === "string") return `${name} (${code})`;
    if (typeof name === "string") return name;
    if (typeof code === "string") return code;
  }
  return "Not available";
}

/**
 * TRAIN MODE card — the single source of truth for journey status in the UI.
 *
 * It always distinguishes:
 *   Location detected  (did we get a GPS fix?)
 *   Journey verified   (did the backend trust the journey?)
 */

export function TrainModeCard({
  journey,
  verification,
  liveTrain,
}: {
  journey: Journey | null;
  verification: VerificationResult | null;
  liveTrain?: LiveTrainData | null;
}) {
  const verified = Boolean(journey?.verified && journey.status === "ACTIVE");
  const demoVerified = Boolean(
    verified && journey?.verify_reason?.startsWith("DEMO_VERIFIED:"),
  );

  return (
    <section className="trainmode" aria-label="Train mode status">
      <header className={`trainmode__head ${verified ? "" : "trainmode__head--off"}`}>
        <div>
          <div className="trainmode__label">Train Mode</div>
          <div className="trainmode__status">
            <span className={`dot ${verified ? "dot--pulse" : ""}`} />
            {demoVerified ? "DEMO VERIFIED" : verified ? "Journey Verified" : journey ? "Not Verified" : "No Active Journey"}
          </div>
        </div>
        <Icon name="train" size={26} strokeWidth={1.6} />
      </header>

      <div className="trainmode__body">
        <div className="tm-grid">
          <div className="tm-cell">
            <div className="tm-cell__label">Train</div>
            <div className="tm-cell__value mono">
              {journey?.train_number ?? liveTrain?.trainNumber ?? "—"}
              {(journey?.train_name ?? liveTrain?.trainName)
                ? ` · ${journey?.train_name ?? liveTrain?.trainName}`
                : ""}
            </div>
          </div>
          <div className="tm-cell">
            <div className="tm-cell__label">Coach</div>
            <div className="tm-cell__value mono">{journey?.coach ?? "—"}</div>
          </div>

          <div className="tm-cell">
            <div className="tm-cell__label">Current / Nearest Station</div>
            <div className="tm-cell__value">
              {verified ? (liveTrain?.currentLocation?.name ?? journey?.current_station_name ?? "In transit") : "—"}
            </div>
          </div>
          <div className="tm-cell">
            <div className="tm-cell__label">Next Station</div>
            <div className="tm-cell__value">
              {verified ? (liveTrain?.nextStation?.name ?? journey?.next_station_name ?? "End of route") : "—"}
            </div>
          </div>
          <div className="tm-cell">
            <div className="tm-cell__label">Distance to Next</div>
            <div className="tm-cell__value">
              {verified && verification?.distanceToNextStationKm != null
                ? `${verification.distanceToNextStationKm.toFixed(1)} km`
                : "—"}
            </div>
          </div>
          <div className="tm-cell">
            <div className="tm-cell__label">Train Speed</div>
            <div className="tm-cell__value">
              {verified && verification?.speedKmph != null
                ? `${Math.round(verification.speedKmph)} km/h`
                : "—"}
            </div>
          </div>
          {liveTrain ? (
            <>
              <div className="tm-cell">
                <div className="tm-cell__label">Delay</div>
                <div className="tm-cell__value">
                  {liveTrain.delayMinutes === null ? "Not available" : `${liveTrain.delayMinutes} min`}
                </div>
              </div>
              <div className="tm-cell">
                <div className="tm-cell__label">Coach Position</div>
                <div className="tm-cell__value">{displayPosition(liveTrain.coachPosition)}</div>
              </div>
              <div className="tm-cell tm-cell--wide">
                <div className="tm-cell__label">
                  {liveTrain.source === "RAILKIT" ? "RailKit route" : "DEMO route fallback"}
                  {liveTrain.source === "RAILKIT" && liveTrain.cached ? " · cached" : ""}
                </div>
                <div className="tm-cell__value">{displayPosition(liveTrain.route)}</div>
              </div>
              {liveTrain.currentLocation &&
              (liveTrain.currentLocation.lat !== null || liveTrain.currentLocation.lng !== null) ? (
                <div className="tm-cell tm-cell--wide">
                  <div className="tm-cell__label">Current Train Location</div>
                  <div className="tm-cell__value mono">
                    {liveTrain.currentLocation.lat ?? "—"}, {liveTrain.currentLocation.lng ?? "—"}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
          {demoVerified ? (
            <div className="tm-cell tm-cell--wide">
              <div className="tm-cell__label">DEMO LOCATION — simulated train coordinates</div>
              <div className="tm-cell__value mono">
                {journey?.last_lat?.toFixed(4)}, {journey?.last_lng?.toFixed(4)}
              </div>
            </div>
          ) : null}

          <div className="tm-cell tm-cell--wide">
            <div className="tm-cell__label">Estimated Arrival</div>
            <div className="tm-cell__value" style={{ whiteSpace: "normal" }}>
              {verified
                ? verification?.eta?.minutes != null
                  ? `≈ ${formatMinutes(verification.eta.minutes)} — ${verification.eta.note}`
                  : (verification?.eta?.scheduledTime
                      ? `Scheduled ${verification.eta.scheduledTime}`
                      : "Not available yet")
                : "—"}
            </div>
          </div>
        </div>

        {verified && journey?.current_station_code && journey.next_station_code ? (
          <div className="route-strip" aria-label="Route progress">
            <span className="route-strip__node">
              <span className="route-strip__code">{journey.current_station_code}</span>
              <span className="route-strip__name">{journey.current_station_name}</span>
            </span>
            <span className="route-strip__line" />
            <Icon name="chevronRight" size={16} />
            <span className="route-strip__line" />
            <span className="route-strip__node">
              <span className="route-strip__code">{journey.next_station_code}</span>
              <span className="route-strip__name">{journey.next_station_name}</span>
            </span>
          </div>
        ) : null}

        {verification ? (
          <div className="row row--wrap" style={{ gap: 8 }}>
            {demoVerified ? <Badge tone="demo">DEMO VERIFIED — location not validated</Badge> : null}
            <Badge tone={verification.locationDetected ? "ok" : "neutral"}>
              Location detected: {verification.locationDetected ? "YES" : "NO"}
            </Badge>
            {!demoVerified ? (
              <Badge tone={verification.verified ? "ok" : "danger"}>
                Journey verified: {verification.verified ? "YES" : "NO"}
              </Badge>
            ) : null}
            <Badge tone={verification.routeSource === "demo" ? "demo" : "info"}>
              Confidence {percent(verification.confidence)}
            </Badge>
            {verification.routeSource === "demo" ? <Badge tone="demo">Demo route data</Badge> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Transparent breakdown of how the confidence score was produced. */
export function VerificationSignals({ verification }: { verification: VerificationResult }) {
  return (
    <section className="card card__pad" aria-label="Verification signals">
      <div className="row row--between" style={{ marginBottom: 10 }}>
        <h2 style={{ fontSize: "0.95rem" }}>Why {verification.verified ? "verified" : "not verified"}</h2>
        <span className="score mono">
          {percent(verification.confidence)} / {percent(verification.threshold)} needed
        </span>
      </div>

      <p className="tiny muted" style={{ marginBottom: 12 }}>
        {verification.reason}
      </p>

      <div className="signals">
        {verification.signals.map((signal) => {
          const tone =
            signal.score >= 0.7 ? "high" : signal.score >= 0.4 ? "mid" : "low";
          return (
            <div className="signal" key={signal.key}>
              <span className="strong">{signal.label}</span>
              <span className="score mono">
                {percent(signal.score)} × {signal.weight}
              </span>
              <span className="signal__bar">
                <span
                  className={`signal__fill signal__fill--${tone}`}
                  style={{ width: `${Math.max(4, Math.round(signal.score * 100))}%` }}
                />
              </span>
              <span className="tiny muted" style={{ gridColumn: "1 / -1" }}>
                {signal.detail}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
