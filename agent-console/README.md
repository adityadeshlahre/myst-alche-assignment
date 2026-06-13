# Agent Console

Next.js 16 (App Router) + React 19 + Tailwind CSS v4 frontend for the Alchemyst mock agent backend.

## Architecture

### WebSocket Layer

```
lib/ws/
├── types.ts            — Protocol types (ServerMessage, ClientMessage)
└── sequenceBuffer.ts   — Out-of-order reordering + dedup buffer

hooks/
└── useAgentSocket.ts   — WebSocket lifecycle + message routing
```

### Sequence Buffer (`sequenceBuffer.ts`)

Handles two chaos-mode requirements: **out-of-order delivery** and **duplicate messages**.

- **Min-heap** for reordering — O(log k) insert, O(1) peek at next expected seq. Messages are held until the gap fills, then drained in seq order.
- **Set** for dedup — O(1) duplicate detection. First arrival wins.
- `flush()` — on STREAM_END or stall recovery, force-releases everything in seq order.
- `resetForReconnection()` — clears heap and set but **preserves `lastProcessed`** so the RESUME message carries the correct DOM-consumed seq.

### WebSocket Hook (`useAgentSocket.ts`)

State machine: `disconnected → connecting → connected → reconnecting → resuming → connected`

Key behaviors:
- **TOOL_ACK sent before buffer processing** — avoids the 5s server timeout race when messages arrive out of order in chaos mode
- **PONG sent immediately** on PING receipt; corrupt PINGs (`challenge: ""`) handled without crash
- **RESUME as first message** on reconnect, using `lastProcessed` from the sequence buffer (DOM-consumed, not socket-received)
- **Exponential backoff**: 500ms, 1s, 2s, 4s, 10s (capped)
- **Stall recovery**: interval force-flushes the buffer every 4s if it gets stuck

### Protocol Types (`types.ts`)

Mirrors the canonical types from `agent-server/src/types.ts`:

| Client sends | When |
|---|---|
| `USER_MESSAGE` | user submits input |
| `PONG` | echoes PING `challenge` within 3s |
| `TOOL_ACK` | immediately on TOOL_CALL receipt |
| `RESUME` | first message on reconnection |

| Server receives | Notes |
|---|---|
| `TOKEN` | streamed chunks, grouped by `stream_id` |
| `TOOL_CALL` | pauses stream, triggers TOOL_ACK |
| `TOOL_RESULT` | resumes paused stream |
| `CONTEXT_SNAPSHOT` | context data at start + mid-response |
| `PING` | heartbeat ~12s interval |
| `STREAM_END` | response complete |
| `ERROR` | may arrive at any point |

## Commands

```bash
npm run dev     # next dev on :3000
npm run build   # next build
npm run lint    # eslint
npm start       # next start (production)
```

## Reference Backend

Start the mock agent server (from repo root):

```bash
docker build -t agent-server ./agent-server
docker run -p 4747:4747 agent-server               # normal mode
docker run -p 4747:4747 agent-server --mode chaos   # chaos mode
```

See `agent-server/README.md` for trigger keywords and protocol details.
