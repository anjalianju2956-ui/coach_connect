import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useJourney } from "../context/JourneyContext";
import { apiGet, ApiError } from "../lib/api";
import { timeAgo } from "../lib/format";
import type { NextStationResponse } from "../types";
import { Banner, Button } from "../components/ui/Button";
import { EmptyState, ErrorState, PageHeader, StallCardSkeleton } from "../components/ui/States";
import { Icon } from "../components/ui/Icon";
import { StallCard } from "../components/stalls/StallCard";

/**
 * Complete list of stalls at the journey's next station.
 * Read-only discovery of stalls at the current or next station.
 */
export function StallsPage() {
  const { journey, restoring, presentationDemo } = useJourney();
  const active = journey && journey.status === "ACTIVE" ? journey : null;
  const verified = Boolean(active && active.verified);

  const [data, setData] = useState<NextStationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const fetchStalls = useCallback(async (journeyId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiGet<NextStationResponse>(
        `/stalls/next-station?journeyId=${encodeURIComponent(journeyId)}`,
      );
      setData(result);
      setLastSync(new Date().toISOString());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load stalls.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (verified && active) void fetchStalls(active.id);
  }, [verified, active?.id, fetchStalls, active]);

  if (!active && restoring) {
    return (
      <div className="stack">
        <PageHeader title="Station stalls" subtitle="Restoring your active journey" />
        <StallCardSkeleton />
        <StallCardSkeleton />
      </div>
    );
  }

  if (!active) {
    return (
      <div className="stack">
        <PageHeader title="Station stalls" />
        <div className="card card__pad">
          <EmptyState
            icon="train"
            title="Start a journey first"
            text="Stalls are only shown for the station your train is approaching."
            action={
              <Link to="/journey" className="btn btn--accent">
                <Icon name="navigation" size={16} /> Start journey
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  if (!verified) {
    return (
      <div className="stack">
        <PageHeader title="Station stalls" />
        <Banner tone="warn" title="Journey not verified">
          Stall recommendations are locked until the server can confirm your journey.
        </Banner>
        <Link to="/journey" className="btn btn--primary btn--block">
          Fix my journey details
        </Link>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader
        title={data ? data.station.name : "Station stalls"}
        subtitle={data ? `Station ${data.station.code}` : "Loading stalls at your next station"}
      />

      {presentationDemo ? (
        <Banner tone="warn" title="DEMO LOCATION — Presentation Demo">
          Seeded train location and demo stall recommendations for train 12951 · coach S1.
        </Banner>
      ) : null}

      {data ? (
        <Banner tone="info" title={`Train ${data.context.trainNumber} · Coach ${data.context.coach}`}>
          {data.context.currentStation
            ? `From ${data.context.currentStation} to ${data.context.nextStation ?? "the end of the route"}.`
            : "Waiting for the first station update."}
        </Banner>
      ) : null}

      <div className="row row--between">
        <span className="tiny muted">
          {lastSync ? `Synced ${timeAgo(lastSync)}` : "Not synced yet"}
        </span>
        <Button variant="quiet" size="sm" onClick={() => void fetchStalls(active.id)} loading={loading}>
          <Icon name="refresh" size={14} /> Refresh
        </Button>
      </div>

      {loading && !data ? (
        <>
          <StallCardSkeleton />
          <StallCardSkeleton />
        </>
      ) : error ? (
        <ErrorState text={error} onRetry={() => void fetchStalls(active.id)} />
      ) : data && data.matches.length === 0 ? (
        <div className="card card__pad">
          <EmptyState
            icon="store"
            title={`No stalls for ${data.station.name}`}
            text="New stations appear here as soon as the backend has data for them."
          />
        </div>
      ) : data ? (
        data.matches.map((match) => <StallCard key={match.stall.id} match={match} journeyId={active.id} />)
      ) : null}
    </div>
  );
}
