import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "accent" | "ghost" | "quiet" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  loading?: boolean;
  icon?: IconName;
}

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  loading = false,
  icon,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonProps) {
  const classes = [
    "btn",
    `btn--${variant}`,
    size !== "md" ? `btn--${size}` : "",
    block ? "btn--block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading ? <span className="btn__spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={17} /> : null}
      {children}
    </button>
  );
}

export interface BannerProps {
  tone?: "info" | "warn" | "danger" | "ok" | "demo";
  title?: string;
  children: ReactNode;
}

export function Banner({ tone = "info", title, children }: BannerProps) {
  const iconName: IconName =
    tone === "danger" || tone === "warn" ? "alert" : tone === "ok" ? "checkCircle" : tone === "demo" ? "info" : "info";
  return (
    <div className={`banner banner--${tone}`} role="status">
      <span className="banner__icon">
        <Icon name={iconName} size={17} />
      </span>
      <div>
        {title ? <strong>{title}</strong> : null}
        {children}
      </div>
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "ok" | "warn" | "danger" | "info" | "demo" | "neutral";
  children: ReactNode;
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
