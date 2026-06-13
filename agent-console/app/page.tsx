"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type {
  ServerMessage,
  TraceEvent,
  ConnectionState,
} from "@/lib/ws/types";
import { useAgentSocket } from "@/hooks/useAgentSocket";
import { WS_URL, HTTP_BASE } from "@/lib/ws/config";
import { StatusBar } from "@/components/ui/StatusBar";
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
    linked_id:
      type === "TOOL_CALL" || type === "TOOL_RESULT"
        ? (rest.call_id as string)
        : undefined,
  };
}

export default function Home() {
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [autoSuiteRunning, setAutoSuiteRunning] = useState(false);
  const pendingEventsRef = useRef<TraceEvent[]>([]);
  const rafIdRef = useRef<number | null>(null);
  const scheduledRef = useRef(false);

  const handleMessage = useCallback((msg: ServerMessage) => {
    pendingEventsRef.current.push(toTraceEvent(msg));
    if (scheduledRef.current) return;
    scheduledRef.current = true;
    rafIdRef.current = requestAnimationFrame(() => {
      scheduledRef.current = false;
      const batch = pendingEventsRef.current.splice(0);
      if (batch.length > 0) {
        setEvents((prev) => [...prev, ...batch]);
      }
    });
  }, []);

  const {
    connect,
    disconnect,
    send,
    bufferSize,
    expectedSeq,
    duplicateDrops,
    heartbeatLatency,
    reconnectCount,
  } = useAgentSocket(WS_URL, {
    onMessage: handleMessage,
    onConnectionChange: setConnectionState,
  });

  useEffect(() => {
    connect();
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [connect]);

  const handleDisconnect = useCallback(() => {
    disconnect();
  }, [disconnect]);

  const handleReconnect = useCallback(() => {
    connect();
  }, [connect]);

  const handleReset = useCallback(async () => {
    try {
      await fetch(`${HTTP_BASE}/reset`, { method: "GET" });
    } catch {
      // server may be unreachable — still clear local state
    }
    disconnect();
    setEvents([]);
    setTimeout(() => connect(), 500);
  }, [disconnect, connect]);

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

  const handleAutoSuite = useCallback(async () => {
    if (autoSuiteRunning) return;
    setAutoSuiteRunning(true);

    const triggers = [
      "hello",
      "generate quarterly report",
      "analyze correlation between metrics",
      "lookup deployment SLA requirements",
      "full database schema with context",
      "write comprehensive document with detailed analysis",
      "how's the weather today",
    ];

    for (const msg of triggers) {
      if (connectionState !== "connected") break;
      handleSend(msg);
      await new Promise((r) => setTimeout(r, 800));
    }

    setAutoSuiteRunning(false);
  }, [autoSuiteRunning, connectionState, handleSend]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-canvas-soft">
      <StatusBar
        connectionState={connectionState}
        events={events}
        bufferSize={bufferSize}
        expectedSeq={expectedSeq}
        duplicateDrops={duplicateDrops}
        heartbeatLatency={heartbeatLatency}
        reconnectCount={reconnectCount}
        onDisconnect={handleDisconnect}
        onReconnect={handleReconnect}
        onReset={handleReset}
        onAutoSuite={handleAutoSuite}
        autoSuiteRunning={autoSuiteRunning}
      />
      <div className="flex flex-1 min-h-0">
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
    </div>
  );
}
