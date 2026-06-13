# AGENTS.md — Alchemyst Assignment

## Overview

Monorepo with 2 packages: a mock agent WebSocket backend (`agent-server/`) and a Next.js frontend console (`agent-console/`). **Do not modify `agent-server/`** — it is the reference backend used for evaluation.

## Developer commands

```bash
# agent-console (the app you build)
npm run dev          # next dev on :3000
npm run build        # next build (must pass for submission)
npm run lint         # eslint (no formatter or typecheck pre-configured)
npm start            # next start (production)

# agent-server (reference backend, Docker recommended)
docker build -t agent-server ./agent-server
docker run -p 4747:4747 agent-server               # normal mode
docker run -p 4747:4747 agent-server --mode chaos   # chaos mode
```

**Command order**: `lint` before `build` — there is no separate typecheck script. Build fails on type errors via Next's built-in type checking.

## Architecture

- **`agent-server/`**: WebSocket server on `ws://localhost:4747/ws`. HTTP endpoints: `GET /health`, `GET /log` (evaluation log — curl this to verify protocol compliance), `GET /reset`. Every server message has `type` + monotonic `seq`. Trigger scripts by keyword in `USER_MESSAGE` (see `agent-server/src/scripts.ts` for keywords).
- **`agent-console/`**: Next.js 16 App Router, React 19, Tailwind CSS v4, TypeScript strict. `@/` path alias → `agent-console/` root. `page.tsx` is still `create-next-app` boilerplate — the entire console must be built from scratch. The `lib/` directory is empty.
- **Canonical protocol types**: `agent-server/src/types.ts` — reference this for all message shapes.
- **Design tokens**: `agent-console/DESIGN.md` contains a Notion-inspired design system (colors, typography, spacing, rounded) usable for UI styling.
- **Installed agent skills**: `tailwind-4-docs` and `web-design-guidelines` (see `skills-lock.json`). `CLAUDE.md` delegates to `AGENTS.md`.

## Protocol & state machine

| Client sends | When |
|---|---|
| `USER_MESSAGE` | user submits input |
| `PONG` | echoes PING `challenge` within 3s (3 missed → server terminates) |
| `TOOL_ACK` | within 2s after rendering a tool call card |
| `RESUME` | immediately on reconnection, with `last_seq` = highest fully-processed seq |

| Server sends | Notes |
|---|---|
| `TOKEN` | streamed 30–80ms apart, grouped by `stream_id` |
| `TOOL_CALL` | pauses stream for that `stream_id` |
| `TOOL_RESULT` | resumes paused stream |
| `CONTEXT_SNAPSHOT` | start of response + mid-response context changes |
| `PING` | heartbeat ~12s interval |
| `STREAM_END` | response complete |
| `ERROR` | may arrive at any point |

State machine: `disconnected → connecting → connected → [streaming | tool_call_pending] → reconnecting → resuming → connected`. The `last_seq` in RESUME must track DOM consumption, not socket arrival.

**Chaos mode**: connection drops (no close frame), out-of-order seq, duplicates, latency spikes (2–8s), corrupt PING (empty `challenge`), 500KB+ context snapshots, rapid sequential tool calls before TOOL_RESULT.

## Critical constraints

- **No AI chat SDKs** — no `ai`, `vercel/ai`, `langchain`. Streaming renderer built from scratch.
- **TypeScript strict** (`"strict": true`). No `any` outside a single documented escape hatch file. No `@ts-ignore`.
- **Only App Router** — no `/pages/` directory.
- **No env vars required** — build must work with `npm install && npm run build && npm start`.
- **No test runner configured** — add one (e.g., Vitest) for protocol logic tests (seq buffer, reordering, dedup).

## Required reading (start here)

Read all `.md` files in the repo (`ASSIGNMENT.md`, `README.md`, `agent-server/README.md`, `agent-console/DESIGN.md`) plus loaded skills (e.g. `web-design-guidelines`, `tailwind-4-docs`) before writing code. These contain the spec, protocol reference, trigger keywords, design tokens, and UI conventions.
