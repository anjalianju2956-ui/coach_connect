import { Link } from "react-router-dom";
import { Badge } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { formatDistance, initials, percent } from "../../lib/format";
import type { StallMatch } from "../../types";

export function StallCard({ match, journeyId }: { match: StallMatch; journeyId: string | null }) {
  const { stall } = match;
  const href = `/stalls/${stall.id}${journeyId ? `?journeyId=${encodeURIComponent(journeyId)}` : ""}`;

  return (
    <Link to={href} className="card" style={{ display: "block", color: "inherit" }}>
      <div className="stall-card">
        <span className={`stall-card__thumb ${stall.is_demo ? "stall-card__thumb--demo" : ""}`} aria-hidden="true">
          {initials(stall.stall_name)}
        </span>

        <div className="stall-card__body">
          <div className="row row--between" style={{ alignItems: "flex-start" }}>
            <span className="stall-card__name ellipsis">{stall.stall_name}</span>
            <Badge tone={match.open_now ? "ok" : "warn"}>{match.open_now ? "Open" : "Closed"}</Badge>
          </div>

          <div className="stall-card__meta">
            <span>
              <Icon name="pin" size={13} /> {stall.station_name}
            </span>
            {stall.platform ? (
              <span>
                <Icon name="train" size={13} /> Platform {stall.platform}
              </span>
            ) : null}
            <span>
              <Icon name="navigation" size={13} /> {formatDistance(match.distance_meters)}
            </span>
            {stall.prep_time_minutes ? (
              <span>
                <Icon name="clock" size={13} /> ~{stall.prep_time_minutes} min
              </span>
            ) : null}
          </div>

          <div className="stall-card__reasons">
            {match.reasons.slice(0, 3).map((reason) => (
              <span
                key={reason}
                className={`reason-pill ${reason.startsWith("Closed") ? "reason-pill--muted" : ""}`}
              >
                {reason}
              </span>
            ))}
          </div>

          <div className="stall-card__foot">
            <span className="score">Match {percent(match.score)} · approximate</span>
            <span className="btn btn--primary btn--sm">
              View menu <Icon name="chevronRight" size={14} />
            </span>
          </div>
        </div>
      </div>

      {stall.is_demo ? (
        <div style={{ padding: "0 13px 12px" }}>
          <span className="demo-flag">Demo data — seeded example stall</span>
        </div>
      ) : null}
    </Link>
  );
}
