"use client";

import { useState, useRef, useEffect } from "react";
import type { TraceEvent } from "@/lib/ws/types";

interface TextBlock {
  kind: "text";
  stream_id: string;
  content: string;
  frozen: boolean;
  seqs: number[];
}

interface ToolBlock {
  kind: "tool";
  call_id: string;
  tool_name: string;
  args: Record<string, unknown>;
  state: "pending" | "completed";
  result?: Record<string, unknown>;
  seqs: number[];
}

interface ErrorBlock {
  kind: "error";
  code: string;
  message: string;
  seqs: number[];
}

type ChatBlock = TextBlock | ToolBlock | ErrorBlock;

function buildBlocks(events: TraceEvent[]): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  let activeText: TextBlock | null = null;

  for (const ev of events) {
    switch (ev.type) {
      case "TOKEN": {
        const sid = ev.stream_id ?? "";
        if (activeText && activeText.stream_id === sid && !activeText.frozen) {
          activeText.content += ev.payload.text;
          activeText.seqs.push(ev.seq);
        } else {
          if (activeText) activeText.frozen = true;
          activeText = {
            kind: "text",
            stream_id: sid,
            content: ev.payload.text as string,
            frozen: false,
            seqs: [ev.seq],
          };
          blocks.push(activeText);
        }
        break;
      }
      case "TOOL_CALL": {
        if (activeText) activeText.frozen = true;
        activeText = null;
        blocks.push({
          kind: "tool",
          call_id: ev.payload.call_id as string,
          tool_name: ev.payload.tool_name as string,
          args: ev.payload.args as Record<string, unknown>,
          state: "pending",
          seqs: [ev.seq],
        });
        break;
      }
      case "TOOL_RESULT": {
        activeText = null;
        const tool = blocks.find(
          (b): b is ToolBlock =>
            b.kind === "tool" && b.call_id === ev.payload.call_id
        );
        if (tool) {
          tool.state = "completed";
          tool.result = ev.payload.result as Record<string, unknown>;
          tool.seqs.push(ev.seq);
        }
        break;
      }
      case "STREAM_END": {
        if (activeText) activeText.frozen = true;
        activeText = null;
        break;
      }
      case "ERROR": {
        if (activeText) activeText.frozen = true;
        activeText = null;
        blocks.push({
          kind: "error",
          code: ev.payload.code as string,
          message: ev.payload.message as string,
          seqs: [ev.seq],
        });
        break;
      }
    }
  }

  return blocks;
}

const QUICK_TRIGGERS = [
  { label: "Hello", msg: "hello" },
  { label: "Report", msg: "summary report q3" },
  { label: "Analyze", msg: "analyze and compare" },
  { label: "DB Schema", msg: "database schema large" },
  { label: "Long", msg: "long detailed document" },
];

export function ChatPanel({
  events,
  connectionState,
  highlightedId,
  onHighlight,
  onSend,
}: {
  events: TraceEvent[];
  connectionState: string;
  highlightedId?: string | null;
  onHighlight?: (id: string) => void;
  onSend: (msg: string) => void;
}) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const blocks = buildBlocks(events);
  const isConnected = connectionState === "connected";
  const hasMessages = blocks.length > 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [blocks.length, events.length]);

  useEffect(() => {
    if (!highlightedId) return;
    const el =
      containerRef.current?.querySelector<HTMLElement>(
        `[data-id="${highlightedId}"]`
      );
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput("");
  };

  return (
    <div className="flex flex-col h-full bg-canvas-soft">
      <div className="flex items-center justify-between px-4 py-3 border-b border-hairline bg-surface">
        <h1 className="text-sm font-semibold text-ink-secondary font-sans">
          Agent Console
        </h1>
        <span
          className={`text-xs font-mono px-2 py-0.5 rounded-full ${
            connectionState === "connected"
              ? "bg-accent-green/10 text-accent-green"
              : connectionState === "connecting" || connectionState === "reconnecting"
                ? "bg-accent-orange/10 text-accent-orange"
                : "bg-accent-orange-deep/10 text-accent-orange-deep"
          }`}
        >
          {connectionState}
        </span>
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-4">
        {!hasMessages ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-sm text-ink-muted font-sans mb-4 max-w-sm">
              Send a message to start. Try one of these:
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK_TRIGGERS.map((t) => (
                <button
                  key={t.msg}
                  disabled={!isConnected}
                  onClick={() => onSend(t.msg)}
                  className="text-xs px-3 py-1.5 rounded-full border border-hairline bg-surface text-ink-secondary hover:bg-canvas-soft disabled:opacity-40 font-sans transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl mx-auto">
            {blocks.map((block, i) => {
              if (block.kind === "text") {
                const lastText =
                  i === blocks.length - 1 &&
                  !block.frozen &&
                  !events.some(
                    (e) =>
                      e.type === "STREAM_END" && e.stream_id === block.stream_id
                  );
                return (
                  <div
                    key={`t-${i}`}
                    data-id={block.stream_id}
                    className={`text-sm text-ink leading-relaxed whitespace-pre-wrap font-sans ${
                      highlightedId === block.stream_id
                        ? "bg-primary/5 rounded px-2 -mx-2"
                        : ""
                    }`}
                  >
                    {block.content}
                    {lastText && (
                      <span className="inline-block w-0.5 h-[1em] bg-primary ml-0.5 animate-pulse align-text-bottom" />
                    )}
                  </div>
                );
              }

              if (block.kind === "tool") {
                return (
                  <div
                    key={`c-${block.call_id}`}
                    data-id={block.call_id}
                    onClick={() => onHighlight?.(block.call_id)}
                    className={`rounded-lg border text-xs font-mono cursor-pointer transition-colors ${
                      highlightedId === block.call_id
                        ? "border-primary bg-primary/5"
                        : "border-hairline bg-surface hover:border-accent-purple"
                    }`}
                  >
                    <div className="flex items-center justify-between px-3 py-2 border-b border-hairline">
                      <span className="text-accent-purple font-semibold">
                        {"\u2699"} {block.tool_name}
                      </span>
                      <span
                        className={`${
                          block.state === "pending"
                            ? "text-accent-orange animate-pulse"
                            : "text-accent-green"
                        }`}
                      >
                        {block.state === "pending"
                          ? "\u25CB waiting"
                          : "\u2713 completed"}
                      </span>
                    </div>
                    <div className="px-3 py-2 space-y-1">
                      <div className="text-ink-faint text-[10px]">args</div>
                      <pre className="text-ink-secondary whitespace-pre-wrap break-all text-[11px]">
                        {JSON.stringify(block.args, null, 2)}
                      </pre>
                    </div>
                    {block.state === "completed" && block.result && (
                      <div className="px-3 py-2 border-t border-hairline space-y-1">
                        <div className="text-ink-faint text-[10px]">
                          result
                        </div>
                        <pre className="text-accent-green whitespace-pre-wrap break-all text-[11px]">
                          {JSON.stringify(block.result, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              }

              if (block.kind === "error") {
                return (
                  <div
                    key={`e-${i}`}
                    className="rounded-lg border border-accent-orange-deep/30 bg-accent-orange-deep/5 px-3 py-2 text-xs"
                  >
                    <div className="text-accent-orange-deep font-semibold font-mono">
                      ERROR [{block.code}]
                    </div>
                    <div className="text-ink-secondary mt-1 font-sans">
                      {block.message}
                    </div>
                  </div>
                );
              }

              return null;
            })}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="px-4 py-3 border-t border-hairline bg-surface"
      >
        <div className="flex gap-2 max-w-3xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isConnected
                ? "Type a message\u2026"
                : "Waiting for connection\u2026"
            }
            disabled={!isConnected}
            className="flex-1 bg-canvas border border-hairline rounded-md px-3 py-2 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-primary disabled:opacity-50 font-sans transition-colors"
          />
          <button
            type="submit"
            disabled={!isConnected || !input.trim()}
            className="px-4 py-2 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-active disabled:opacity-40 transition-colors font-sans"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
