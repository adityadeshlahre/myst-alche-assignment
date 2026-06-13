import { describe, it, expect } from "vitest";
import { buildBlocks } from "@/components/chat/ChatPanel";
import type { TraceEvent } from "@/lib/ws/types";

function tok(seq: number, streamId: string, text: string): TraceEvent {
  return {
    id: `tok-${seq}`,
    seq,
    type: "TOKEN",
    timestamp: 0,
    payload: { text },
    stream_id: streamId,
  };
}

function toolCall(
  seq: number,
  callId: string,
  toolName = "test_tool",
  args: Record<string, unknown> = {},
): TraceEvent {
  return {
    id: `tc-${seq}`,
    seq,
    type: "TOOL_CALL",
    timestamp: 0,
    payload: { call_id: callId, tool_name: toolName, args },
    stream_id: "s1",
    linked_id: callId,
  };
}

function toolResult(
  seq: number,
  callId: string,
  result: Record<string, unknown> = {},
): TraceEvent {
  return {
    id: `tr-${seq}`,
    seq,
    type: "TOOL_RESULT",
    timestamp: 0,
    payload: { call_id: callId, result },
    stream_id: "s1",
    linked_id: callId,
  };
}

function streamEnd(seq: number, streamId = "s1"): TraceEvent {
  return {
    id: `end-${seq}`,
    seq,
    type: "STREAM_END",
    timestamp: 0,
    payload: { stream_id: streamId },
    stream_id: streamId,
  };
}

function errorEv(seq: number, code: string, message: string): TraceEvent {
  return {
    id: `err-${seq}`,
    seq,
    type: "ERROR",
    timestamp: 0,
    payload: { code, message },
  };
}

describe("buildBlocks", () => {
  it("empty events returns empty blocks", () => {
    expect(buildBlocks([])).toEqual([]);
  });

  it("single text block from consecutive tokens", () => {
    const blocks = buildBlocks([tok(1, "s1", "Hello "), tok(2, "s1", "world")]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: "text",
      content: "Hello world",
      frozen: false,
    });
  });

  it("different stream_id creates separate frozen blocks", () => {
    const blocks = buildBlocks([
      tok(1, "s1", "Stream A "),
      tok(2, "s2", "Stream B "),
      tok(3, "s1", "continues"),
    ]);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({
      kind: "text",
      content: "Stream A ",
      frozen: true,
    });
    expect(blocks[1]).toMatchObject({
      kind: "text",
      content: "Stream B ",
      frozen: true,
    });
    expect(blocks[2]).toMatchObject({
      kind: "text",
      content: "continues",
      frozen: false,
    });
  });

  it("tool call freezes active text and creates tool block", () => {
    const blocks = buildBlocks([
      tok(1, "s1", "Before "),
      toolCall(2, "tc_01", "lookup", { key: "value" }),
    ]);
    expect(blocks).toHaveLength(2);
    // text frozen
    expect(blocks[0]).toMatchObject({
      kind: "text",
      content: "Before ",
      frozen: true,
    });
    // tool call created
    expect(blocks[1]).toMatchObject({
      kind: "tool",
      call_id: "tc_01",
      tool_name: "lookup",
      args: { key: "value" },
      state: "pending",
    });
  });

  it("tool result marks tool as completed", () => {
    const blocks = buildBlocks([
      toolCall(1, "tc_01"),
      toolResult(2, "tc_01", { answer: 42 }),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: "tool",
      call_id: "tc_01",
      state: "completed",
      result: { answer: 42 },
    });
  });

  it("tool result after text interruption resumes new text block", () => {
    const blocks = buildBlocks([
      tok(1, "s1", "Before "),
      toolCall(2, "tc_01"),
      toolResult(3, "tc_01"),
      tok(4, "s1", "After"),
    ]);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({
      kind: "text",
      content: "Before ",
      frozen: true,
    });
    expect(blocks[1]).toMatchObject({
      kind: "tool",
      call_id: "tc_01",
      state: "completed",
    });
    expect(blocks[2]).toMatchObject({
      kind: "text",
      content: "After",
      frozen: false,
    });
  });

  it("multiple sequential tool calls stack correctly", () => {
    const blocks = buildBlocks([
      tok(1, "s1", "Start "),
      toolCall(2, "tc_01", "tool_a"),
      toolResult(3, "tc_01", { ok: true }),
      toolCall(4, "tc_02", "tool_b"),
      toolResult(5, "tc_02", { ok: true }),
      tok(6, "s1", " End"),
    ]);
    expect(blocks).toHaveLength(4);
    expect(blocks[0]).toMatchObject({
      kind: "text",
      content: "Start ",
      frozen: true,
    });
    expect(blocks[1]).toMatchObject({
      kind: "tool",
      call_id: "tc_01",
      tool_name: "tool_a",
      state: "completed",
    });
    expect(blocks[2]).toMatchObject({
      kind: "tool",
      call_id: "tc_02",
      tool_name: "tool_b",
      state: "completed",
    });
    expect(blocks[3]).toMatchObject({
      kind: "text",
      content: " End",
      frozen: false,
    });
  });

  it("STREAM_END freezes active text", () => {
    const blocks = buildBlocks([tok(1, "s1", "Content"), streamEnd(2, "s1")]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: "text",
      content: "Content",
      frozen: true,
    });
  });

  it("ERROR freezes active text and creates error block", () => {
    const blocks = buildBlocks([
      tok(1, "s1", "Before "),
      errorEv(2, "ERR_001", "Something failed"),
    ]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      kind: "text",
      content: "Before ",
      frozen: true,
    });
    expect(blocks[1]).toMatchObject({
      kind: "error",
      code: "ERR_001",
      message: "Something failed",
    });
  });

  it("rapid tool calls before result both show pending", () => {
    const blocks = buildBlocks([
      tok(1, "s1", "Thinking "),
      toolCall(2, "tc_01"),
      toolCall(3, "tc_02"),
      toolResult(4, "tc_01"),
      toolResult(5, "tc_02"),
    ]);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({ kind: "text", frozen: true });
    expect(blocks[1]).toMatchObject({
      kind: "tool",
      call_id: "tc_01",
      state: "completed",
    });
    expect(blocks[2]).toMatchObject({
      kind: "tool",
      call_id: "tc_02",
      state: "completed",
    });
  });
});
