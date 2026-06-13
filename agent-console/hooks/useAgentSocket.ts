"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import type { ServerMessage, ClientMessage } from "@/lib/ws/types";
import { SequenceBuffer } from "@/lib/ws/sequenceBuffer";

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "resuming";

const BACKOFF = [500, 1_000, 2_000, 4_000, 10_000] as const;

export interface UseSocketCallbacks {
  onMessage: (msg: ServerMessage) => void;
  onConnectionChange: (state: ConnectionState) => void;
}

export function useAgentSocket(url: string, callbacks: UseSocketCallbacks) {
  const wsRef = useRef<WebSocket | null>(null);
  const seqBufRef = useRef(new SequenceBuffer());
  const backoffIdxRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unmountedRef = useRef(false);

  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");

  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const setState = useCallback((s: ConnectionState) => {
    setConnectionState(s);
    callbacksRef.current.onConnectionChange(s);
  }, []);

  const connectRef = useRef<() => void>(() => {});

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (stallTimerRef.current) {
      clearInterval(stallTimerRef.current);
      stallTimerRef.current = null;
    }
    backoffIdxRef.current = 0;
    setState("disconnected");
    wsRef.current?.close();
    wsRef.current = null;
  }, [setState]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setState("connecting");
    const ws = new WebSocket(url);
    wsRef.current = ws;
    const seqBuf = seqBufRef.current;

    ws.onopen = () => {
      if (unmountedRef.current) return;

      const lastSeq = seqBuf.getLastProcessed();
      if (lastSeq >= 0) {
        setState("resuming");
        const resume: ClientMessage = { type: "RESUME", last_seq: lastSeq };
        ws.send(JSON.stringify(resume));
        seqBuf.resetForReconnection();
      }

      setState("connected");
      backoffIdxRef.current = 0;

      if (!stallTimerRef.current) {
        stallTimerRef.current = setInterval(() => {
          if (seqBuf.size() > 0) {
            const flushed = seqBuf.flush();
            for (const m of flushed) callbacksRef.current.onMessage(m);
          }
        }, 4_000);
      }
    };

    ws.onmessage = (event) => {
      if (unmountedRef.current) return;
      let msg: ServerMessage;
      try {
        const raw = JSON.parse(event.data);
        if (!raw || typeof raw !== "object" || !("type" in raw)) return;
        msg = raw as ServerMessage;
      } catch {
        return;
      }

      if (msg.type === "TOOL_CALL") {
        const ack: ClientMessage = { type: "TOOL_ACK", call_id: msg.call_id };
        ws.send(JSON.stringify(ack));
      }

      if (msg.type === "PING") {
        const challenge = msg.challenge ?? "";
        const pong: ClientMessage = { type: "PONG", echo: challenge };
        ws.send(JSON.stringify(pong));
      }

      const accepted = seqBuf.insert(msg);
      if (!accepted) return;

      const drained = seqBuf.drain();
      for (const m of drained) callbacksRef.current.onMessage(m);

      if (msg.type === "STREAM_END") {
        const flushed = seqBuf.flush();
        for (const m of flushed) callbacksRef.current.onMessage(m);
      }
    };

    ws.onclose = () => {
      if (unmountedRef.current) return;
      if (wsRef.current !== ws) return;
      wsRef.current = null;

      if (backoffIdxRef.current < BACKOFF.length) {
        setState("reconnecting");
        const delay = BACKOFF[backoffIdxRef.current];
        backoffIdxRef.current++;
        reconnectTimerRef.current = setTimeout(
          () => connectRef.current?.(),
          delay,
        );
      } else {
        setState("disconnected");
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [url, setState]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const send = useCallback((msg: ClientMessage) => {
    wsRef.current?.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      disconnect();
    };
  }, [disconnect]);

  return { connectionState, connect, disconnect, send };
}
