export type DiffKind = "added" | "removed" | "changed" | "same";

export interface DiffNode {
  key: string;
  kind: DiffKind;
  oldVal?: unknown;
  newVal?: unknown;
  children?: DiffNode[];
}

export interface DiffRequest {
  prev: Record<string, unknown> | null;
  next: Record<string, unknown>;
  jobId: string;
}

export interface DiffResponse {
  nodes: DiffNode[];
  jobId: string;
}
