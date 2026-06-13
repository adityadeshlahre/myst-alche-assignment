type DiffKind = "added" | "removed" | "changed" | "same";

interface DiffNode {
  key: string;
  kind: DiffKind;
  oldVal?: unknown;
  newVal?: unknown;
  children?: DiffNode[];
}

interface WorkerMessage {
  prev: Record<string, unknown> | null;
  next: Record<string, unknown>;
  jobId: string;
}

function diffObjects(
  prev: Record<string, unknown> | null,
  next: Record<string, unknown>,
  depth = 0,
): DiffNode[] {
  const keys = new Set([
    ...Object.keys(next),
    ...(prev ? Object.keys(prev) : []),
  ]);
  const nodes: DiffNode[] = [];

  for (const key of keys) {
    const inPrev = prev !== null && key in prev;
    const inNext = key in next;

    if (!inPrev) {
      nodes.push({ key, kind: "added", newVal: next[key] });
    } else if (!inNext) {
      nodes.push({ key, kind: "removed", oldVal: prev![key] });
    } else {
      const pv = prev![key];
      const nv = next[key];

      if (
        depth < 3 &&
        pv !== null &&
        nv !== null &&
        typeof pv === "object" &&
        typeof nv === "object" &&
        !Array.isArray(pv) &&
        !Array.isArray(nv)
      ) {
        const children = diffObjects(
          pv as Record<string, unknown>,
          nv as Record<string, unknown>,
          depth + 1,
        );
        const hasChange = children.some((c) => c.kind !== "same");
        nodes.push({ key, kind: hasChange ? "changed" : "same", children });
      } else {
        const changed = JSON.stringify(pv) !== JSON.stringify(nv);
        nodes.push({
          key,
          kind: changed ? "changed" : "same",
          oldVal: pv,
          newVal: nv,
        });
      }
    }
  }

  return nodes;
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { prev, next, jobId } = event.data;
  const nodes = diffObjects(prev, next);
  self.postMessage({ nodes, jobId });
};
