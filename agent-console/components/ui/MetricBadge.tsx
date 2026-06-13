"use client";

export function MetricBadge({
  label: labelText,
  value,
  subtitle,
  highlight,
  pulse,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  highlight?: boolean;
  pulse?: boolean;
}) {
  return (
    <span className="text-ink-faint">
      {labelText}{" "}
      <span
        className={`font-semibold ${
          highlight
            ? "text-accent-orange"
            : pulse
              ? "text-accent-purple"
              : "text-ink-secondary"
        } ${pulse ? "animate-pulse" : ""}`}
      >
        {value}
      </span>
      {subtitle && (
        <span className="text-ink-faint text-[10px] ml-0.5">{subtitle}</span>
      )}
    </span>
  );
}
