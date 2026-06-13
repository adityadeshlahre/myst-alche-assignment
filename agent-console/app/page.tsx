"use client";

import { useState, useCallback, useEffect } from "react";
import type { ServerMessage, TraceEvent, ConnectionState } from "@/lib/ws/types";
import { useAgentSocket } from "@/hooks/useAgentSocket";
import { WS_URL } from "@/lib/ws/config";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { TraceTimeline } from "@/components/timeline/TraceTimeline";
import { ContextInspector } from "@/components/context/ContextInspector";

let eventCounter = 0;

function toTraceEvent(msg: ServerMessage): TraceEvent {
  const id = `${msg.type}-${msg.seq}-${++eventCounter}`;
  const { type, seq, ...rest } = msg as unknown as Record<string, unknown>;
  return {
    id,
    seq: seq as number,
    type: type as TraceEvent["type"],
    timestamp: Date.now(),
    payload: rest as Record<string, unknown>,
    stream_id: (rest.stream_id as string) ?? undefined,
    linked_id: type === "TOOL_CALL" || type === "TOOL_RESULT" ? (rest.call_id as string) : undefined,
  };
}

export default function Home() {
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const handleMessage = useCallback((msg: ServerMessage) => {
    setEvents((prev) => [...prev, toTraceEvent(msg)]);
  }, []);

  const { connect, send } = useAgentSocket(WS_URL, {
    onMessage: handleMessage,
    onConnectionChange: setConnectionState,
  });

  useEffect(() => {
    connect();
  }, [connect]);

  const handleSend = useCallback(
    (text: string) => {
      const userEvent: TraceEvent = {
        id: `user-${Date.now()}`,
        seq: -1,
        type: "USER_MESSAGE",
        timestamp: Date.now(),
        payload: { content: text },
      };
      setEvents((prev) => [...prev, userEvent]);
      send({ type: "USER_MESSAGE", content: text });
    },
    [send],
  );

  return (
    <div className="flex h-screen overflow-hidden bg-canvas-soft">
      <div className="w-80 shrink-0 border-r border-hairline bg-surface">
        <TraceTimeline
          events={events}
          highlightedId={highlightedId}
          onHighlight={setHighlightedId}
        />
      </div>

      <div className="flex-1 min-w-0">
        <ChatPanel
          events={events}
          connectionState={connectionState}
          highlightedId={highlightedId}
          onHighlight={setHighlightedId}
          onSend={handleSend}
        />
      </div>

      <div className="w-72 shrink-0">
        <ContextInspector events={events} />
      </div>
    </div>
  );
}
