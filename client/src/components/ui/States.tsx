import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/** Loading spinner with an accessible label. */
export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="btn__spinner" style={{ color: "var(--brand-600)", width: 26, height: 26 }} />
      <span className="state__text">{label}</span>
    </div>
  );
}

export function EmptyState({
  icon = "search",
  title,
  text,
  action,
}: {
  icon?: IconName;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="state">
      <span className="state__icon">
        <Icon name={icon} size={22} />
      </span>
      <span className="state__title">{title}</span>
      {text ? <span className="state__text">{text}</span> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  text,
  onRetry,
}: {
  title?: string;
  text: string;
  onRetry?: () => void;
}) {
  return (
    <div className="state" role="alert">
      <span className="state__icon" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
        <Icon name="alert" size={22} />
      </span>
      <span className="state__title">{title}</span>
      <span className="state__text">{text}</span>
      {onRetry ? (
        <button type="button" className="btn btn--quiet btn--sm" onClick={onRetry}>
          <Icon name="refresh" size={15} /> Try again
        </button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skel ${className}`} aria-hidden="true" />;
}

export function StallCardSkeleton() {
  return (
    <div className="card stall-card" aria-hidden="true">
      <div className="skel" style={{ width: 58, height: 58, borderRadius: 8, flex: "none" }} />
      <div style={{ flex: 1, display: "grid", gap: 9, alignSelf: "center" }}>
        <div className="skel skel-line" style={{ width: "55%" }} />
        <div className="skel skel-line" style={{ width: "35%" }} />
        <div className="skel skel-line" style={{ width: "70%" }} />
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?: () => void }) {
  return (
    <div className="page-head">
      {onBack ? (
        <button type="button" className="back-btn" onClick={onBack} aria-label="Go back">
          <Icon name="arrowLeft" size={18} />
        </button>
      ) : null}
      <div className="grow">
        <h1>{title}</h1>
        {subtitle ? <div className="muted tiny">{subtitle}</div> : null}
      </div>
    </div>
  );
}
