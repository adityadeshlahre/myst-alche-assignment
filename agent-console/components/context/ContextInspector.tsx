"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import type { TraceEvent } from "@/lib/ws/types";
import type { DiffNode, DiffKind } from "@/lib/diff/types";
import { requestDiff, destroyWorker } from "@/lib/diff/engine";

const DIFF_STYLES: Record<DiffKind, string> = {
  added: "bg-accent-green/10 border-l-2 border-accent-green",
  removed: "bg-accent-orange/10 border-l-2 border-accent-orange-deep",
  changed: "bg-accent-sky/10 border-l-2 border-accent-sky",
  same: "",
};

const DIFF_PREFIX: Record<DiffKind, string> = {
  added: "+ ",
  removed: "- ",
  changed: "~ ",
  same: "  ",
};

function formatVal(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") return `"${v.slice(0, 200)}"`;
  if (typeof v === "object") {
    return Array.isArray(v) ? `[${(v as unknown[]).length}]` : "{...}";
  }
  return String(v);
}

function TreeNode({
  node,
  showDiff,
  depth = 0,
}: {
  node: DiffNode;
  showDiff: boolean;
  depth?: number;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const style = showDiff ? DIFF_STYLES[node.kind] : "";

  return (
    <div className={`pl-2 ${style} my-px`}>
      <div
        className={`flex items-start gap-1 cursor-pointer rounded px-1 py-0.5 hover:bg-canvas-soft/50 ${
          hasChildren ? "" : "hover:bg-transparent"
        }`}
        onClick={() => {
          if (hasChildren) setOpen((v) => !v);
        }}
      >
        {hasChildren && (
          <span className="text-ink-faint select-none w-3">
            {open ? "\u25BE" : "\u25B8"}
          </span>
        )}
        {!hasChildren && <span className="w-3" />}
        {showDiff && (
          <span className="text-ink-faint font-mono text-xs w-4">
            {DIFF_PREFIX[node.kind]}
          </span>
        )}
        <span className="text-accent-sky font-mono text-xs font-medium">
          {node.key}:
        </span>
        {!hasChildren && (
          <span className="font-mono text-xs ml-1">
            {node.kind === "changed" && showDiff ? (
              <>
                <span className="text-accent-orange-deep line-through">
                  {formatVal(node.oldVal)}
                </span>
                <span className="text-accent-green ml-1.5">
                  {formatVal(node.newVal)}
                </span>
              </>
            ) : node.kind === "removed" && showDiff ? (
              <span className="text-accent-orange-deep">
                {formatVal(node.oldVal)}
              </span>
            ) : (
              <span className="text-ink">
                {formatVal(node.newVal ?? node.oldVal)}
              </span>
            )}
          </span>
        )}
      </div>
      {hasChildren && open && (
        <div className="ml-3">
          {node.children!.map((child, i) => (
            <TreeNode
              key={`${child.key}-${i}`}
              node={child}
              showDiff={showDiff}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ContextSnapshot {
  context_id: string;
  data: Record<string, unknown>;
  seq: number;
  timestamp: number;
}

export function ContextInspector({ events }: { events: TraceEvent[] }) {
  const snapshots: ContextSnapshot[] = useMemo(
    () =>
      events
        .filter((e) => e.type === "CONTEXT_SNAPSHOT")
        .map((e) => ({
          context_id: e.payload.context_id as string,
          data: e.payload.data as Record<string, unknown>,
          seq: e.seq,
          timestamp: e.timestamp,
        })),
    [events],
  );

  const byId = useMemo(() => {
    const map = new Map<string, ContextSnapshot[]>();
    for (const s of snapshots) {
      const list = map.get(s.context_id) ?? [];
      list.push(s);
      map.set(s.context_id, list);
    }
    return map;
  }, [snapshots]);

  const ids = useMemo(() => Array.from(byId.keys()), [byId]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [step, setStep] = useState(0);
  const [diffNodes, setDiffNodes] = useState<DiffNode[]>([]);
  const cancelledRef = useRef(false);

  const activeId = selectedId || ids[0] || "";
  const history = activeId ? (byId.get(activeId) ?? []) : [];
  const clamped = Math.min(step, Math.max(0, history.length - 1));
  const current = history[clamped];
  const prev = clamped > 0 ? history[clamped - 1] : null;
  const showDiff = prev !== null;

  useEffect(() => {
    if (!current) return;
    cancelledRef.current = false;
    requestDiff(prev?.data ?? null, current.data).then((nodes) => {
      if (!cancelledRef.current) {
        setDiffNodes(nodes);
      }
    });
    return () => {
      cancelledRef.current = true;
    };
  }, [current, prev]);

  useEffect(() => {
    return () => destroyWorker();
  }, []);

  const handleIdChange = (id: string) => {
    setSelectedId(id);
    setStep(0);
  };

  return (
    <div className="flex flex-col h-full bg-surface border-l border-hairline">
      <div className="px-4 py-3 border-b border-hairline space-y-2">
        <h2 className="text-sm font-semibold text-ink-secondary font-sans">
          Context Inspector
        </h2>
        {ids.length > 0 && (
          <select
            value={activeId}
            onChange={(e) => handleIdChange(e.target.value)}
            className="w-full bg-canvas border border-hairline rounded-xs px-2 py-1.5 text-xs text-ink focus:outline-none focus:border-primary font-sans"
          >
            {ids.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        )}
      </div>

      {history.length > 1 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-hairline">
          <button
            disabled={clamped === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="text-xs px-2 py-0.5 rounded-md border border-hairline text-ink-muted disabled:opacity-40 hover:bg-canvas-soft font-sans"
          >
            {"\u2190"}
          </button>
          <span className="text-xs text-ink-muted font-mono flex-1 text-center">
            snapshot {clamped + 1} / {history.length}
            {showDiff && " (diff)"}
          </span>
          <button
            disabled={clamped >= history.length - 1}
            onClick={() => setStep((s) => Math.min(history.length - 1, s + 1))}
            className="text-xs px-2 py-0.5 rounded-md border border-hairline text-ink-muted disabled:opacity-40 hover:bg-canvas-soft font-sans"
          >
            {"\u2192"}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {!activeId || !current ? (
          <div className="text-xs text-ink-faint text-center mt-8">
            No context snapshots yet.
          </div>
        ) : (
          <div className="font-mono text-xs">
            {diffNodes.map((node, i) => (
              <TreeNode
                key={`${node.key}-${i}`}
                node={node}
                showDiff={showDiff}
              />
            ))}
          </div>
        )}
      </div>

      {current && (
        <div className="px-4 py-1.5 border-t border-hairline text-[11px] text-ink-faint font-mono">
          seq#{current.seq} ·{" "}
          {new Date(current.timestamp).toISOString().slice(11, 23)}
        </div>
      )}
    </div>
  );
}
