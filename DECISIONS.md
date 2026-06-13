# Design Decisions

## Seq-Based Ordering and Deduplication

**Data structure:** Min-heap + Set.

The `SequenceBuffer` class uses two structures:

- **Min-heap** — maintains incoming messages sorted by `seq` at O(log k) insert cost. When the next expected seq (`lastProcessed + 1`) is at the root, it is drained. This handles out-of-order delivery from chaos mode without holding messages indefinitely.

- **`Set<seq>`** — tracks every seq that has entered the buffer. O(1) duplicate detection. First arrival wins; subsequent copies of the same seq are silently dropped.

On `STREAM_END`, `flush()` sorts whatever remains in the heap by seq and releases everything. A 4-second stall recovery interval does the same if the buffer gets stuck (e.g. a dropped message that will never arrive).

**Why not a sorted-array or Map?** A Map with scan-for-next pattern would be O(n) per drain. The min-heap gives O(log k) insert + O(1) peek, which matters when tokens arrive at 30+/second and the buffer could hold dozens of shuffled messages.

## Layout Shift Prevention (Tool Call Interruptions)

*Not yet implemented. Planned approach:* When a `TOOL_CALL` arrives mid-stream, the active token segment is marked as `frozen` — its text is never mutated again, so React never reconciles those DOM nodes. The tool call card renders below the frozen segment. On `TOOL_RESULT`, a new unfrozen token segment opens beneath the card. This avoids reflow because frozen segments are structurally immutable.

## Reconnection State Recovery

The `SequenceBuffer.lastProcessed` counter tracks what the DOM has consumed — it only advances when `drain()` releases a message to the callback. This is distinct from what the socket has received (which could be ahead due to buffering).

On reconnect:
1. The stale socket closes. Exponential backoff (500ms–10s) schedules a new connection.
2. `ws.onopen` fires. The hook immediately sends `RESUME` with `lastProcessed` — this is the first message on the new connection.
3. The sequence buffer's `resetForReconnection()` clears the heap and seen-set but **preserves `lastProcessed`** so the RESUME value is correct.
4. The server replays events after that seq. Incoming messages re-enter the buffer, get deduplicated against the (now-empty) seen-set, and drain in order.

**Key invariant:** `lastProcessed` only moves forward, never resets to zero. This prevents double-processing or gaps after reconnection.

## Future: 50 Concurrent Agent Streams

*Analysis only, not implemented.*

A single `useReducer` bottlenecking all streams through one dispatch would not scale. Instead, each stream would get its own `SequenceBuffer` instance and a dedicated reducer slice (or a write-optimised store like `zustand` with per-stream subscriptions).

The single WebSocket approach would also need to change — 50 streams implies 50 connections or a multiplexed protocol. If the backend supports a single connection with stream routing, the sequence buffer design generalises naturally (partition by `stream_id`). If not, each connection gets its own `useAgentSocket` instance, each with independent backoff and lifecycle.

Virtual scrolling would be mandatory in the timeline for this scale.

## Future: 100x Longer Responses

*Analysis only, not implemented.*

Token accumulation in the reducer state would become a memory concern. Instead of appending every chunk to an in-memory array, the renderer would progressively flush older frozen segments to a write-behind buffer (or IndexedDB) and keep only a window of recent segments in React state.

The timeline token batching would need pagination or cursor-based loading rather than holding all trace events in memory. Virtual scrolling becomes required, not optional.

The sequence buffer itself is unaffected — it only buffers what hasn't been released to the consumer, which should remain small (~dozens of messages) regardless of total response length.
