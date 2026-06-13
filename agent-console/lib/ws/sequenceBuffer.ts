import type { ServerMessage } from "./types";

type Seq = number;

/**
 * Min-heap that buffers out-of-order server messages and
 * emits them in seq-order once gaps are filled.
 * Deduplicates by seq (first arrival wins).
 */
export class SequenceBuffer {
  private heap: ServerMessage[] = [];
  private seen: Set<Seq> = new Set();
  private lastProcessed: Seq = 0;

  /** Insert a message. Returns true if accepted, false if duplicate. */
  insert(msg: ServerMessage): boolean {
    if (this.seen.has(msg.seq)) return false;
    this.seen.add(msg.seq);
    this.heap.push(msg);
    this.bubbleUp(this.heap.length - 1);
    return true;
  }

  /** Drain all messages whose seq is the next expected one. */
  drain(): ServerMessage[] {
    const result: ServerMessage[] = [];
    while (
      this.heap.length > 0 &&
      this.heap[0].seq === this.lastProcessed + 1
    ) {
      const msg = this.pop();
      result.push(msg);
      this.lastProcessed = msg.seq;
    }
    return result;
  }

  /** Peek at the next expected seq without draining. */
  nextExpected(): Seq {
    return this.lastProcessed + 1;
  }

  /** Force-return everything in the buffer (for STREAM_END or stall recovery). */
  flush(): ServerMessage[] {
    const result: ServerMessage[] = [];
    this.heap.sort((a, b) => a.seq - b.seq);
    for (const msg of this.heap) {
      if (msg.seq > this.lastProcessed) {
        this.lastProcessed = msg.seq;
        result.push(msg);
      }
    }
    this.heap = [];
    return result;
  }

  /** Reset for reconnection — preserve lastProcessed so RESUME is correct. */
  resetForReconnection(): void {
    this.heap = [];
    this.seen = new Set();
  }

  getLastProcessed(): Seq {
    return this.lastProcessed;
  }

  size(): number {
    return this.heap.length;
  }

  // --- min-heap helpers ---

  private pop(): ServerMessage {
    const top = this.heap[0];
    const bottom = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.heap[idx].seq >= this.heap[parent].seq) break;
      [this.heap[idx], this.heap[parent]] = [this.heap[parent], this.heap[idx]];
      idx = parent;
    }
  }

  private sinkDown(idx: number): void {
    const n = this.heap.length;
    while (true) {
      let smallest = idx;
      const left = idx * 2 + 1;
      const right = idx * 2 + 2;
      if (left < n && this.heap[left].seq < this.heap[smallest].seq)
        smallest = left;
      if (right < n && this.heap[right].seq < this.heap[smallest].seq)
        smallest = right;
      if (smallest === idx) break;
      [this.heap[idx], this.heap[smallest]] = [
        this.heap[smallest],
        this.heap[idx],
      ];
      idx = smallest;
    }
  }
}
