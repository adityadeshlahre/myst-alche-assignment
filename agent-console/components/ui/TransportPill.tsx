"use client";

import type { ConnectionState } from "@/lib/ws/types";

function label(state: ConnectionState): string {
  switch (state) {
    case "connected":
      return "CONNECTED";
    case "connecting":
      return "CONNECTING";
    case "reconnecting":
      return "RECONNECTING";
    case "resuming":
      return "RESUMING";
    case "disconnected":
      return "DISCONNECTED";
  }
}

function color(state: ConnectionState): string {
  switch (state) {
    case "connected":
      return "bg-accent-green/15 text-accent-green";
    case "connecting":
    case "resuming":
      return "bg-accent-sky/15 text-accent-sky";
    case "reconnecting":
      return "bg-accent-orange/15 text-accent-orange";
    case "disconnected":
      return "bg-accent-orange-deep/15 text-accent-orange-deep";
  }
}

export function TransportPill({
  connectionState,
}: {
  connectionState: ConnectionState;
}) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-ink-faint">Transport</span>
      <span
        className={`px-1.5 py-0.5 rounded-sm font-semibold text-[10px] ${color(connectionState)}`}
      >
        {label(connectionState)}
      </span>
    </div>
  );
}
