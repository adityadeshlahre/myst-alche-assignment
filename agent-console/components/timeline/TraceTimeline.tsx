"use client";

import { useState, useRef, useEffect, useMemo, memo } from "react";
import type { TraceEvent } from "@/lib/ws/types";

const EVENT_CONFIG: Record<
  string,
  { label: string; color: string }
> = {
  TOKEN: { label: "TOKEN", color: "text-ink-muted" },
  TOOL_CALL: { label: "TOOL_CALL", color: "text-accent-purple" },
  TOOL_RESULT: { label: "TOOL_RESULT", color: "text-accent-green" },
  CONTEXT_SNAPSHOT: { label: "CONTEXT", color: "text-accent-sky" },
  PING: { label: "PING", color: "text-accent-orange" },
  STREAM_END: { label: "STREAM_END", color: "text-accent-teal" },
  ERROR: { label: "ERROR", color: "text-accent-orange-deep" },
  USER_MESSAGE: { label: "USER_MSG", color: "text-primary" },
  PONG: { label: "PONG", color: "text-accent-orange" },
  BUFFER_HOLD: { label: "BUFFERED", color: "text-accent-brown" },
};

const EVENT_TYPES = Object.keys(EVENT_CONFIG);

type LinkStyle = "start" | "end" | "none";

function eventSummary(event: TraceEvent): string {
  const p = event.payload;
  switch (event.type) {
    case "TOOL_CALL":
      return `${p.tool_name as string} (${p.call_id as string})`;
    case "TOOL_RESULT":
      return `result for ${p.call_id as string}`;
    case "CONTEXT_SNAPSHOT":
      return `ctx:${p.context_id as string}`;
    case "PING":
      return `challenge: ${(p.challenge as string) || "(empty)"}`;
    case "STREAM_END":
      return `stream:${p.stream_id as string}`;
    case "ERROR":
      return `[${p.code as string}] ${p.message as string}`;
    case "USER_MESSAGE":
      return p.content as string;
    case "BUFFER_HOLD":
      return `seq #${String(p.seq)} arrived early — waiting for #${String(p.waiting_for)}`;
    default:
      return "";
  }
}

const TraceRow = memo(function TraceRow({
  event,
  highlighted,
  linkStyle,
  onClick,
}: {
  event: TraceEvent;
  highlighted: boolean;
  linkStyle: LinkStyle;
  onClick: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = EVENT_CONFIG[event.type] ?? {
    label: event.type,
    color: "text-ink-muted",
  };
  const time = new Date(event.timestamp).toISOString().slice(11, 23);
  const isBatch = event.type === "TOKEN";
  const summary = isBatch
    ? `Streamed ${event.tokenCount ?? 1} token${(event.tokenCount ?? 1) !== 1 ? "s" : ""} (${event.durationMs ?? 0}ms)`
    : eventSummary(event);

  return (
    <div
      id={`trace-row-${event.id}`}
      className={`
        border-b border-hairline cursor-pointer select-none relative text-sm
        ${highlighted ? "bg-primary/5" : "hover:bg-canvas-soft"}
        ${linkStyle !== "none" ? "border-l-2 border-accent-purple" : ""}
      `}
      onClick={() => {
        onClick();
        if (isBatch) setExpanded((v) => !v);
      }}
    >
      {linkStyle === "start" && (
        <span className="absolute left-[-1px] bottom-0 w-0.5 h-1/2 bg-accent-purple/70 block" />
      )}
      {linkStyle === "end" && (
        <span className="absolute left-[-1px] top-0 w-0.5 h-1/2 bg-accent-purple/70 block" />
      )}

      <div
        className={`flex items-center gap-3 py-2 ${
          linkStyle === "end" ? "pl-6 pr-4" : "px-4"
        }`}
      >
        <span className="text-ink-faint w-16 shrink-0 font-mono text-xs">
          {time}
        </span>
        <span className={`w-22 shrink-0 font-semibold text-xs ${cfg.color}`}>
          {linkStyle === "end" && (
            <span className="text-accent-purple/70 mr-1">└</span>
          )}
          {cfg.label}
        </span>
        <span className="text-ink-muted truncate flex-1 text-xs">
          {summary}
        </span>
        {event.seq > 0 && (
          <span className="text-ink-faint shrink-0 font-mono text-xs">
            #{event.seq}
          </span>
        )}
      </div>

      {expanded && isBatch && event.tokenText && (
        <div className="px-4 pb-2 text-xs text-ink-secondary whitespace-pre-wrap font-mono pl-[116px]">
          {event.tokenText}
        </div>
      )}
    </div>
  );
});

export function TraceTimeline({
  events,
  highlightedId,
  onHighlight,
}: {
  events: TraceEvent[];
  highlightedId?: string | null;
  onHighlight?: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Set<string>>(new Set(EVENT_TYPES));
  const [search, setSearch] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevHighlightRef = useRef<string | null>(null);

  useEffect(() => {
    if (autoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [events.length]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    autoScrollRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  };

  useEffect(() => {
    const id = highlightedId;
    if (!id || id === prevHighlightRef.current) return;
    prevHighlightRef.current = id;

    const target =
      events.find(
        (ev) => ev.linked_id === id && ev.type === "TOOL_CALL"
      ) ?? events.find((ev) => ev.id === id);

    if (!target) return;
    const el = document.getElementById(`trace-row-${target.id}`);
    if (!el) return;
    autoScrollRef.current = false;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedId, events]);

  const filtered = useMemo(() => {
    const seenBatches = new Set<string>();
    return events.filter((ev) => {
      if (!filter.has(ev.type)) return false;
      if (search) {
        const hay = JSON.stringify(ev.payload).toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      if (ev.type === "TOKEN") {
        if (seenBatches.has(ev.id)) return false;
        seenBatches.add(ev.id);
      }
      return true;
    });
  }, [events, filter, search]);

  const linkedIds = useMemo(() => {
    const calls = new Set<string>();
    const results = new Set<string>();
    for (const ev of filtered) {
      if (ev.type === "TOOL_CALL" && ev.linked_id) calls.add(ev.linked_id);
      if (ev.type === "TOOL_RESULT" && ev.linked_id)
        results.add(ev.linked_id);
    }
    return new Set([...calls].filter((id) => results.has(id)));
  }, [filtered]);

  const linkStyle = (ev: TraceEvent): LinkStyle => {
    if (ev.type === "TOOL_CALL" && ev.linked_id && linkedIds.has(ev.linked_id))
      return "start";
    if (
      ev.type === "TOOL_RESULT" &&
      ev.linked_id &&
      linkedIds.has(ev.linked_id)
    )
      return "end";
    return "none";
  };

  const toggleType = (t: string) => {
    setFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full bg-surface border-l border-hairline">
      <div className="px-4 py-3 border-b border-hairline space-y-2">
        <h2 className="text-sm font-semibold text-ink-secondary font-sans">
          Trace Timeline
        </h2>
        <input
          type="text"
          placeholder="Search events\u2026"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-canvas border border-hairline rounded-xs px-2 py-1.5 text-xs text-ink placeholder-ink-faint focus:outline-none focus:border-primary font-sans"
        />
        <div className="flex flex-wrap gap-1">
          {EVENT_TYPES.map((t) => {
            const cfg = EVENT_CONFIG[t];
            const active = filter.has(t);
            return (
              <button
                key={t}
                onClick={() => toggleType(t)}
                className={`text-[11px] px-2 py-0.5 rounded-md border transition-colors font-sans ${
                  active
                    ? `${cfg.color} border-current bg-current/5`
                    : "text-ink-faint border-hairline hover:text-ink-muted"
                }`}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {filtered.map((ev) => (
          <TraceRow
            key={ev.id}
            event={ev}
            highlighted={
              highlightedId === ev.id || highlightedId === ev.linked_id
            }
            linkStyle={linkStyle(ev)}
            onClick={() => onHighlight?.(ev.linked_id ?? ev.id)}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 py-1.5 border-t border-hairline text-[11px] text-ink-faint font-mono">
        {filtered.length} / {events.length} events
      </div>
    </div>
  );
}
