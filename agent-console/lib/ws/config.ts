const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4747";

export const WS_URL = `${WS_BASE}/ws`;

export const HTTP_BASE = process.env.NEXT_PUBLIC_HTTP_URL ?? "http://localhost:4747";
