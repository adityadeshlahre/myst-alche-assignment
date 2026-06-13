// Server -> Client messages
export interface TokenMessage {
  type: "TOKEN";
  seq: number;
  text: string;
  stream_id: string;
}

export interface ToolCallMessage {
  type: "TOOL_CALL";
  seq: number;
  call_id: string;
  tool_name: string;
  args: Record<string, unknown>;
  stream_id: string;
}

export interface ToolResultMessage {
  type: "TOOL_RESULT";
  seq: number;
  call_id: string;
  result: Record<string, unknown>;
  stream_id: string;
}

export interface ContextSnapshotMessage {
  type: "CONTEXT_SNAPSHOT";
  seq: number;
  context_id: string;
  data: Record<string, unknown>;
}

export interface PingMessage {
  type: "PING";
  seq: number;
  challenge: string;
}

export interface StreamEndMessage {
  type: "STREAM_END";
  seq: number;
  stream_id: string;
}

export interface ErrorMessage {
  type: "ERROR";
  seq: number;
  code: string;
  message: string;
}

export type ServerMessage =
  | TokenMessage
  | ToolCallMessage
  | ToolResultMessage
  | ContextSnapshotMessage
  | PingMessage
  | StreamEndMessage
  | ErrorMessage;

// Client -> Server messages
export interface UserMessagePayload {
  type: "USER_MESSAGE";
  content: string;
}

export interface PongPayload {
  type: "PONG";
  echo: string;
}

export interface ResumePayload {
  type: "RESUME";
  last_seq: number;
}

export interface ToolAckPayload {
  type: "TOOL_ACK";
  call_id: string;
}

export type ClientMessage =
  | UserMessagePayload
  | PongPayload
  | ResumePayload
  | ToolAckPayload;

// Application state types
export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "resuming";

export type TraceEventType =
  | ServerMessage["type"]
  | "PONG"
  | "USER_MESSAGE"
  | "BUFFER_HOLD";

export interface BufferHoldPayload {
  type: "BUFFER_HOLD";
  seq: number;
  waiting_for: number;
}

export interface TraceEvent {
  id: string;
  seq: number;
  type: TraceEventType;
  timestamp: number;
  payload: Record<string, unknown>;
  tokenCount?: number;
  tokenText?: string;
  durationMs?: number;
  linked_id?: string;
  stream_id?: string;
}
