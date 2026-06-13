# Design Decisions

## UI Design System

Styled after the Notion design language (see `agent-console/DESIGN.md`): warm off-white canvas (`#f6f5f4`), near-black Inter type, a single blue primary (`#0075de`), and a decorative accent palette (purple, green, sky, orange, teal, brown) for event-type colouring. All tokens are defined as Tailwind v4 theme colours in `globals.css`.

Components are organised into three panels: chat (centre), trace timeline (left or collapsible side), context inspector (right). Shared primitives live in `components/ui/`.

All three panel components are **props-based** (no global store dependency). They receive `TraceEvent[]` and callbacks — this keeps them reusable, testable, and decoupled from the WebSocket layer.

## Three-Panel Layout

The main page (`app/page.tsx`) renders three panels in a horizontal flex: TraceTimeline (320px, left), ChatPanel (flex-1, centre), ContextInspector (288px, right). The parent owns all shared state:

- `TraceEvent[]` — accumulated from `useAgentSocket.onMessage`. Each `ServerMessage` is projected into a `TraceEvent` with a unique `id`, timestamp, and `linked_id` (for TOOL_CALL/TOOL_RESULT pairs).
- `connectionState` — synced from the hook via `onConnectionChange` callback.
- `highlightedId` — shared between ChatPanel and TraceTimeline for bidirectional highlight.

The parent calls `connect()` once on mount via `useEffect`. The hook manages reconnection internally via exponential backoff; the parent's `onConnectionChange` callback keeps the UI in sync.

`toTraceEvent(msg)` uses `as unknown as Record<string, unknown>` to destructure the discriminated `ServerMessage` union — this is the single documented type escape hatch in the codebase.

## Deployment

The reference backend is containerised and deployed on Render at `wss://{}.onrender.com/ws`. The console defaults to `ws://localhost:4747/ws` for local dev and uses `NEXT_PUBLIC_WS_URL` env var for the deployed URL. No env vars are required to build — `npm install && npm run build && npm start` works out of the box.

## Seq-Based Ordering and Deduplication

**Data structure:** Min-heap + Set.

The `SequenceBuffer` class uses two structures:

- **Min-heap** — maintains incoming messages sorted by `seq` at O(log k) insert cost. When the next expected seq (`lastProcessed + 1`) is at the root, it is drained. This handles out-of-order delivery from chaos mode without holding messages indefinitely.

- **`Set<seq>`** — tracks every seq that has entered the buffer. O(1) duplicate detection. First arrival wins; subsequent copies of the same seq are silently dropped.

On `STREAM_END`, `flush()` sorts whatever remains in the heap by seq and releases everything. A 4-second stall recovery interval does the same if the buffer gets stuck (e.g. a dropped message that will never arrive).

**Why not a sorted-array or Map?** A Map with scan-for-next pattern would be O(n) per drain. The min-heap gives O(log k) insert + O(1) peek, which matters when tokens arrive at 30+/second and the buffer could hold dozens of shuffled messages.

## Layout Shift Prevention (Tool Call Interruptions)

When a `TOOL_CALL` arrives mid-stream, the active `TextBlock` is frozen — its content string is never mutated again, so React never reconciles those DOM nodes. The `ToolBlock` card renders below the frozen segment. On `TOOL_RESULT`, a new unfrozen `TextBlock` opens beneath the card (pushed into `blocks[]` as a fresh entry). This avoids reflow because frozen blocks have stable content and the new block appends to the end.

Because `buildBlocks` projects events into stable keyed blocks (`t-0`, `t-1`, `c-<call_id>`, etc.), React reconciles by key — existing frozen blocks stay mounted, only the active text block updates, and new blocks append.

`TOOL_ACK` is sent **immediately on socket receipt**, before the message enters the reorder buffer. This prevents the server's 5-second TOOL_ACK timeout from expiring while the message waits in the buffer — a critical edge case in chaos mode where messages arrive out of order.

## Chat Rendering — BuildBlocks Projection

The `ChatPanel` does not render `TraceEvent[]` directly. Instead, `buildBlocks(events)` projects the flat event stream into a `ChatBlock[]` with three variants:

- **`TextBlock`** — accumulates `TOKEN` events sharing the same `stream_id`. Frozen once a `TOOL_CALL`, `ERROR`, or new `stream_id` arrives.
- **`ToolBlock`** — created on `TOOL_CALL`, updated on `TOOL_RESULT`. Shows args immediately, result on completion.
- **`ErrorBlock`** — rendered on `ERROR` with code + message.

This projection approach means the chat panel is a **pure function of `TraceEvent[]`** — no hidden state, no reducer, no Redux. The same events always produce the same blocks. This makes reconnection trivial: just replay events from the buffer.

The projection also enables efficient React reconciliation: frozen blocks have stable keys and never mutate, while the active (unfrozen) text block appends in place.

## Observability StatusBar

A thin top bar spanning all three panels shows real-time transport and protocol metrics. Broken into three sub-components:

- **`TransportPill`** — connection state as a color-coded pill (CONNECTED green, CONNECTING/RESUMING sky, RECONNECTING orange, DISCONNECTED deep orange).
- **`MetricBadge`** — reusable `label value (subtitle)` display with optional highlight (orange when non-zero) and pulse (purple for pending).
- **`StatusActions`** — three buttons: Disconnect (closes WS), Reconnect (calls `connect()` with resume), Reset Session (hits `GET /reset`, clears events, reconnects fresh).

Metrics displayed: `Transport` · `reconnects` · `events` · `tokens` · `seq` · `expected` · `drops` · `heartbeat` · `throughput` · `streams` · `buffer` · `pending tools`.

The `useAgentSocket` hook exposes additional reactive state for the bar: `bufferSize`, `expectedSeq`, `duplicateDrops`, `heartbeatLatency`, `reconnectCount`. All updated synchronously within the `onmessage` handler to avoid stale reads.

## Throughput Calculation

Events and tokens per second are computed in the `StatusBar` using a sliding 2-second window. Each render iterates `events[]`, counting entries where `now - ev.timestamp < 2000`. The 2-second count is halved to produce events/sec or tokens/sec. A 1-second interval via `setInterval` keeps `now` fresh so the window slides correctly between streaming bursts.

## Heartbeat Latency

The server's `PING` challenge is a random UUID (not a timestamp), so true RTT cannot be measured from the client. Instead, `useAgentSocket` measures the synchronous processing delay between receiving a `PING` and sending its `PONG` reply using `performance.now()`. In normal operation this is 0ms; in chaos mode with a blocked event loop it may spike, providing a coarse indicator of client-side pressure.

## Duplicate Drop Tracking

The `SequenceBuffer.insert()` method returns `false` when a message's `seq` is already in the seen-set. The hook increments `duplicateDrops` on each rejection, providing a direct count of how many out-of-order or replayed messages the server sent that were safely ignored.

## Manual Session Controls

Three buttons live in the `StatusActions` component (right side of the StatusBar):

- **Disconnect** — calls `disconnect()` from the hook, which closes the WebSocket, clears timers, and sets state to `disconnected`. Disabled when not connected.
- **Reconnect** — calls `connect()`, which opens a new WebSocket and sends `RESUME` with the last processed seq. Always enabled (user can force a fresh connection).
- **Reset Session** — fetches `GET /reset` on the HTTP base URL (`http://localhost:4747` by default, configurable via `NEXT_PUBLIC_HTTP_URL`), then disconnects, clears all events, and reconnects after 500ms. This gives a fully clean slate.

The `HTTP_BASE` config is derived from the same env-var pattern as `WS_URL`, defaulting to `http://localhost:4747`.

## Quick Trigger Chips

The `ChatPanel` renders a set of pre-configured trigger keywords ("Hello", "Report", "Analyze", "DB Schema", "Long") in the empty state. These call `onSend()` directly, matching the server's `scripts.ts` trigger keywords for quick manual testing without typing.

## Bidirectional Highlight

Both `ChatPanel` and `TraceTimeline` accept a shared `highlightedId` prop + `onHighlight` callback. When a user clicks a tool call card in chat, it calls `onHighlight(call_id)` which sets `highlightedId` in the parent. The timeline responds by scrolling to the matching `TOOL_CALL` row and highlighting it (and vice versa). The mechanism uses `data-id` attributes for DOM targeting and a `ref` guard (`prevHighlightRef`) to prevent scroll loops.

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
