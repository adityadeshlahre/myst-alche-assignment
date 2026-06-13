"use client";

import { useState, useEffect, useRef } from "react";
import type { TraceEvent, ConnectionState } from "@/lib/ws/types";
import { TransportPill } from "@/components/ui/TransportPill";
import { MetricBadge } from "@/components/ui/MetricBadge";
import { StatusActions } from "@/components/ui/StatusActions";

export function StatusBar({
  connectionState,
  events,
  bufferSize,
  duplicateDrops,
  heartbeatLatency,
  reconnectCount,
  onDisconnect,
  onReconnect,
  onReset,
  onAutoSuite,
  autoSuiteRunning,
}: {
  connectionState: ConnectionState;
  events: TraceEvent[];
  bufferSize: number;
  duplicateDrops: number;
  heartbeatLatency: number;
  reconnectCount: number;
  onDisconnect: () => void;
  onReconnect: () => void;
  onReset: () => void;
  onAutoSuite: () => void;
  autoSuiteRunning: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  let lastSeq = -1;
  let pendingTools = 0;
  let totalTokens = 0;
  let eventsLast2s = 0;
  let tokensLast2s = 0;

  for (const ev of events) {
    if (ev.seq > lastSeq) lastSeq = ev.seq;
    if (ev.type === "TOKEN") {
      totalTokens++;
      if (now - ev.timestamp < 2000) tokensLast2s++;
    }
    if (ev.type === "TOOL_CALL") pendingTools++;
    if (ev.type === "TOOL_RESULT") pendingTools--;
    if (now - ev.timestamp < 2000) eventsLast2s++;
  }

  const isConnected = connectionState === "connected";

  return (
    <div className="flex items-center gap-4 px-4 py-2.5 bg-canvas border-b border-hairline text-xs font-mono min-h-[40px]">
      <TransportPill connectionState={connectionState} />

      <span className="text-hairline">|</span>
      <span className="text-ink-faint">
        reconnects{" "}
        <span
          className={`font-semibold ${
            reconnectCount > 0
              ? "text-accent-orange-deep"
              : "text-ink-secondary"
          }`}
        >
          {reconnectCount}
        </span>
      </span>

      <span className="text-hairline">|</span>

      <MetricBadge label="events" value={events.length} />

      {(tokensLast2s > 0 || totalTokens > 0) && (
        <>
          <span className="text-hairline">|</span>
          <MetricBadge label="tokens" value={totalTokens} />
        </>
      )}

      {lastSeq >= 0 && (
        <>
          <span className="text-hairline">|</span>
          <MetricBadge label="seq" value={`#${lastSeq}`} />
        </>
      )}

      <span className="text-hairline">|</span>
      <MetricBadge
        label="drops"
        value={duplicateDrops}
        highlight={duplicateDrops > 0}
      />

      <span className="text-hairline">|</span>
      <MetricBadge label="heartbeat" value={`${heartbeatLatency} ms`} />

      <span className="text-hairline">|</span>
      <MetricBadge
        label="throughput"
        value={`${Math.round(eventsLast2s / 2)}`}
        subtitle={tokensLast2s > 0 ? `tok/s` : `ev/s`}
      />

      <span className="text-hairline">|</span>

      <MetricBadge
        label="buffer"
        value={bufferSize}
        highlight={bufferSize > 0}
      />

      {pendingTools > 0 && (
        <>
          <span className="text-hairline">|</span>
          <MetricBadge
            label=""
            value={`${pendingTools} tool${pendingTools !== 1 ? "s" : ""} pending`}
            pulse
          />
        </>
      )}

      <div className="flex-1" />

      <StatusActions
        isConnected={isConnected}
        autoSuiteRunning={autoSuiteRunning}
        onDisconnect={onDisconnect}
        onReconnect={onReconnect}
        onReset={onReset}
        onAutoSuite={onAutoSuite}
      />

      <span className="text-ink-faint text-[10px]" suppressHydrationWarning>
        {new Date(now).toLocaleTimeString()}
      </span>
    </div>
  );
}
