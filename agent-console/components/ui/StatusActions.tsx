"use client";

import { useState } from "react";

export function StatusActions({
  isConnected,
  autoSuiteRunning,
  onDisconnect,
  onReconnect,
  onReset,
  onAutoSuite,
}: {
  isConnected: boolean;
  autoSuiteRunning: boolean;
  onDisconnect: () => void;
  onReconnect: () => void;
  onReset: () => void;
  onAutoSuite: () => void;
}) {
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    setResetting(true);
    await onReset();
    setResetting(false);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onAutoSuite}
        disabled={autoSuiteRunning || !isConnected}
        className="px-2 py-0.5 rounded-xs text-[10px] font-semibold font-mono
          border border-hairline bg-surface text-accent-green
          hover:bg-accent-green/5 disabled:opacity-30 disabled:cursor-not-allowed
          transition-colors"
      >
        {autoSuiteRunning ? "Running\u2026" : "Run Auto Suite"}
      </button>
      <button
        onClick={onDisconnect}
        disabled={!isConnected}
        className="px-2 py-0.5 rounded-xs text-[10px] font-semibold font-mono
          border border-hairline bg-surface text-accent-orange-deep
          hover:bg-accent-orange-deep/5 disabled:opacity-30 disabled:cursor-not-allowed
          transition-colors"
      >
        Disconnect
      </button>
      <button
        onClick={onReconnect}
        className="px-2 py-0.5 rounded-xs text-[10px] font-semibold font-mono
          border border-hairline bg-surface text-accent-sky
          hover:bg-accent-sky/5 transition-colors"
      >
        Reconnect
      </button>
      <button
        onClick={handleReset}
        disabled={resetting}
        className="px-2 py-0.5 rounded-xs text-[10px] font-semibold font-mono
          border border-hairline bg-surface text-accent-orange
          hover:bg-accent-orange/5 disabled:opacity-30 disabled:cursor-not-allowed
          transition-colors"
      >
        {resetting ? "Resetting\u2026" : "Reset Session"}
      </button>
    </div>
  );
}
