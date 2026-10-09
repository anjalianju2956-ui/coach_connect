import { Icon } from "../ui/Icon";
import { formatAccuracy, formatSpeed, timeAgo } from "../../lib/format";
import type { GeoState } from "../../hooks/useGeolocation";

/**
 * Location status widget — deliberately separate from journey verification so
 * the passenger never confuses "we have a location" with "you are verified".
 */
export function LocationStatus({
  state,
  onAllow,
  onStop,
  tracking,
}: {
  state: GeoState;
  onAllow: () => void;
  onStop?: () => void;
  tracking?: boolean;
}) {
  const tone =
    state.status === "ready"
      ? "ok"
      : state.status === "denied" || state.status === "unsupported"
        ? "danger"
        : state.status === "timeout" || state.status === "unavailable"
          ? "warn"
          : "info";

  return (
    <div className="stack stack--sm">
      <div className="locstat">
        <span className="locstat__icon">
          <Icon name="pin" size={18} />
        </span>
        <div className="grow">
          <div className="row row--between">
            <span className="locstat__k">Location</span>
            <span className={`badge badge--${tone}`}>
              {state.status === "ready"
                ? "Connected"
                : state.status === "locating"
                  ? "Finding…"
                  : state.status === "denied"
                    ? "Blocked"
                    : state.status === "idle"
                      ? "Not allowed"
                      : "Unavailable"}
            </span>
          </div>
          <div className="locstat__grid" style={{ marginTop: 6 }}>
            <span>
              <span className="locstat__k">Accuracy</span>
              <br />
              <span className="locstat__v">
                {state.status === "ready" ? formatAccuracy(state.position?.accuracy) : "—"}
              </span>
            </span>
            <span>
              <span className="locstat__k">Speed</span>
              <br />
              <span className="locstat__v">
                {state.status === "ready" ? formatSpeed(state.position?.speed ? state.position.speed * 3.6 : null) : "—"}
              </span>
            </span>
            <span>
              <span className="locstat__k">Updated</span>
              <br />
              <span className="locstat__v">{state.lastUpdated ? timeAgo(new Date(state.lastUpdated).toISOString()) : "—"}</span>
            </span>
          </div>
          <div className="tiny muted" style={{ marginTop: 6 }}>
            {state.message}
          </div>
        </div>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onAllow}>
          <Icon name="navigation" size={15} />
          {state.status === "ready" ? "Refresh location" : "Allow location"}
        </button>
        {onStop && tracking ? (
          <button type="button" className="btn btn--danger btn--sm" onClick={onStop}>
            <Icon name="x" size={15} /> Stop tracking
          </button>
        ) : null}
      </div>
    </div>
  );
}
