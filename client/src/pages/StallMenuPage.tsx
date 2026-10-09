import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useJourney } from "../context/JourneyContext";
import { apiGet, ApiError } from "../lib/api";
import { formatDistance, formatMoney } from "../lib/format";
import type { MenuItem, Stall, StallMatch } from "../types";
import { Badge, Banner } from "../components/ui/Button";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "../components/ui/States";
import { Icon } from "../components/ui/Icon";

interface MenuResponse {
  stall: Stall;
  items: MenuItem[];
}

export function StallMenuPage() {
  const { stallId = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { journey } = useJourney();

  const journeyId = params.get("journeyId") ?? journey?.id ?? null;
  const presentationDemo = Boolean(
    journey?.status === "ACTIVE" &&
      journey.verify_reason?.startsWith("DEMO_VERIFIED: DEMO_SIMULATION:"),
  );

  const [data, setData] = useState<MenuResponse | null>(null);
  const [match, setMatch] = useState<StallMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!stallId) return;
    setLoading(true);
    setError(null);
    try {
      const menu = await apiGet<MenuResponse>(`/stalls/${encodeURIComponent(stallId)}/menu`);
      setData(menu);
      if (journeyId) {
        try {
          setMatch(await apiGet<StallMatch>(`/stalls/${encodeURIComponent(stallId)}?journeyId=${encodeURIComponent(journeyId)}`));
        } catch {
          setMatch(null);
        }
      } else {
        setMatch(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this stall.");
    } finally {
      setLoading(false);
    }
  }, [stallId, journeyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    if (!data) return [] as Array<{ category: string; items: MenuItem[] }>;
    const map = new Map<string, MenuItem[]>();
    for (const item of data.items) {
      const key = item.category || "Menu";
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
    return [...map.entries()].map(([category, items]) => ({ category, items }));
  }, [data]);

  if (loading) {
    return (
      <div className="stack">
        <PageHeader title="Menu" />
        <div className="card card__pad stack stack--sm">
          <Skeleton />
          <div className="skel skel-line" style={{ width: "40%" }} />
        </div>
        <div className="card card__pad stack stack--sm">
          <div className="skel skel-line" style={{ width: "60%" }} />
          <div className="skel skel-line" style={{ width: "75%" }} />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="stack">
        <PageHeader title="Menu" onBack={() => navigate(-1)} />
        <ErrorState text={error ?? "Stall not found."} onRetry={() => void load()} />
      </div>
    );
  }

  const stall = data.stall;
  const open = match?.open_now ?? true;
  const hasDemoCoordinates =
    presentationDemo &&
    typeof journey?.last_lat === "number" &&
    typeof journey.last_lng === "number" &&
    typeof stall.latitude === "number" &&
    typeof stall.longitude === "number";
  const directionsUrl = hasDemoCoordinates
    ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${journey!.last_lat},${journey!.last_lng}`)}&destination=${encodeURIComponent(`${stall.latitude},${stall.longitude}`)}&travelmode=walking`
    : null;

  return (
    <div className="stack">
      <PageHeader title={stall.stall_name} subtitle={`Station ${stall.station_name}`} onBack={() => navigate(-1)} />

      <div className="card card__pad stack stack--sm">
        <div className="row row--wrap" style={{ gap: 8 }}>
          <Badge tone={open ? "ok" : "warn"}>{open ? "Open now" : "Closed"}</Badge>
          {stall.platform ? <Badge tone="info">Platform {stall.platform}</Badge> : null}
          {stall.prep_time_minutes ? <Badge tone="neutral">~{stall.prep_time_minutes} min prep</Badge> : null}
          {stall.rating ? (
            <Badge tone="neutral">
              <Icon name="star" size={12} /> {stall.rating.toFixed(1)}
            </Badge>
          ) : null}
          {stall.is_demo ? <Badge tone="demo">Demo stall</Badge> : null}
        </div>

        {stall.description ? <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>{stall.description}</p> : null}

        {match ? (
          <>
            <div className="row row--between tiny muted">
              <span>
                <Icon name="pin" size={13} /> {formatDistance(match.distance_meters)} from your position
              </span>
              <span className="score">Match {Math.round(match.score * 100)}%</span>
            </div>
            <div className="row row--wrap" style={{ gap: 6 }}>
              {match.reasons.map((reason) => (
                <span
                  key={reason}
                  className={`reason-pill ${reason.startsWith("Closed") ? "reason-pill--muted" : ""}`}
                >
                  {reason}
                </span>
              ))}
            </div>
          </>
        ) : null}

        {match && !match.platform_match ? (
          <Banner tone="warn">Your coach may be on a different platform — check the display before you walk over.</Banner>
        ) : null}
      </div>

      {directionsUrl ? (
        <div className="card card__pad stack stack--sm">
          <div className="row row--between">
            <h2 style={{ fontSize: "0.95rem", margin: 0 }}>Presentation Demo directions</h2>
            <Badge tone="demo">Approximate</Badge>
          </div>
          <div className="tiny muted">
            Coach S1 approximate position: {journey!.last_lat!.toFixed(4)}, {journey!.last_lng!.toFixed(4)}
          </div>
          <div className="tiny muted">
            Stall location: {stall.latitude!.toFixed(4)}, {stall.longitude!.toFixed(4)}
          </div>
          <div className="tiny muted">
            Approximate walking distance: {formatDistance(match?.distance_meters ?? null)} (straight-line estimate).
            Coach position uses the simulated train location, not a measured coach-specific position.
          </div>
          <a className="btn btn--primary" href={directionsUrl} target="_blank" rel="noreferrer">
            <Icon name="navigation" size={15} /> Get directions
          </a>
        </div>
      ) : null}

      {data.items.length === 0 ? (
        <div className="card card__pad">
          <EmptyState icon="store" title="Menu coming soon" text="This stall has not published items yet." />
        </div>
      ) : (
        grouped.map((group) => (
          <section className="stack stack--sm" key={group.category} aria-label={group.category}>
            <div className="section-title" style={{ marginBottom: 0 }}>
              <h2>{group.category}</h2>
            </div>
            {group.items.map((item) => {
              return (
                <div className="card card__pad" key={item.id} style={{ opacity: item.is_available ? 1 : 0.55 }}>
                  <div className="row row--between" style={{ alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div className="row row--wrap" style={{ gap: 8, alignItems: "baseline" }}>
                        <span className="strong">{item.name}</span>
                        <span className="score">{formatMoney(item.price)}</span>
                      </div>
                      {item.description ? <div className="tiny muted">{item.description}</div> : null}
                      {!item.is_available ? <div className="tiny" style={{ color: "var(--danger)" }}>Out of stock</div> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        ))
      )}
    </div>
  );
}
