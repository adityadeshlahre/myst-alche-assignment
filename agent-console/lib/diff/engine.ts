import type { DiffResponse } from "./types";

type WorkerRef = {
  current: Worker | null;
};

const workerRef: WorkerRef = { current: null };
let jobCounter = 0;
const pending = new Map<string, (nodes: DiffResponse["nodes"]) => void>();

function getWorker(): Worker | null {
  if (typeof window === "undefined") return null;
  if (!workerRef.current) {
    workerRef.current = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current.onmessage = (event: MessageEvent<DiffResponse>) => {
      const { nodes, jobId } = event.data;
      const resolve = pending.get(jobId);
      if (resolve) {
        resolve(nodes);
        pending.delete(jobId);
      }
    };
  }
  return workerRef.current;
}

export function requestDiff(
  prev: Record<string, unknown> | null,
  next: Record<string, unknown>,
): Promise<DiffResponse["nodes"]> {
  const worker = getWorker();
  if (!worker) {
    return Promise.resolve([]);
  }

  const jobId = `diff_${++jobCounter}`;
  return new Promise((resolve) => {
    pending.set(jobId, resolve);
    worker.postMessage({ prev, next, jobId });
  });
}

export function destroyWorker(): void {
  if (workerRef.current) {
    workerRef.current.terminate();
    workerRef.current = null;
  }
  pending.clear();
}
