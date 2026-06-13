"use client";

import { useState, type ReactNode } from "react";

export interface TraceLogEntryProps {
  label: string;
  labelColor: string;
  summary: string;
  timestamp: string;
  seq?: number;
  expanded?: boolean;
  onToggle?: () => void;
  highlighted?: boolean;
  onClick?: () => void;
  children?: ReactNode;
  connector?: "start" | "end" | "none";
}

export function TraceLogEntry({
  label,
  labelColor,
  summary,
  timestamp,
  seq,
  expanded: controlledExpanded,
  onToggle,
  highlighted,
  onClick,
  children,
  connector = "none",
}: TraceLogEntryProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded ?? internalExpanded;

  const handleClick = () => {
    if (children) {
      if (onToggle) onToggle();
      else setInternalExpanded((v) => !v);
    }
    onClick?.();
  };

  const connectorClass =
    connector === "start" || connector === "end"
      ? "border-l-2 border-purple-500/70"
      : "";

  return (
    <div
      className={`
        border-b border-zinc-800/50 cursor-pointer select-none relative
        ${highlighted ? "bg-blue-950/50" : "hover:bg-zinc-800/30"}
        ${connectorClass}
      `}
      onClick={handleClick}
    >
      {connector === "start" && (
        <span className="absolute left-[-1px] bottom-0 w-0.5 h-1/2 bg-purple-500/70 block" />
      )}
      {connector === "end" && (
        <span className="absolute left-[-1px] top-0 w-0.5 h-1/2 bg-purple-500/70 block" />
      )}

      <div
        className={`flex items-center gap-2 py-1.5 text-xs font-mono ${
          connector === "end" ? "pl-5 pr-3" : "px-3"
        }`}
      >
        <span className="text-zinc-600 w-20 shrink-0">{timestamp}</span>
        <span className={`w-24 shrink-0 font-semibold ${labelColor}`}>
          {connector === "end" && (
            <span className="text-purple-500/70 mr-1">└</span>
          )}
          {label}
        </span>
        <span className="text-zinc-400 truncate flex-1">{summary}</span>
        {seq !== undefined && seq > 0 && (
          <span className="text-zinc-600 shrink-0">#{seq}</span>
        )}
      </div>

      {isExpanded && children && (
        <div className="px-3 pb-2 text-xs text-zinc-300 whitespace-pre-wrap font-mono pl-[112px]">
          {children}
        </div>
      )}
    </div>
  );
}
