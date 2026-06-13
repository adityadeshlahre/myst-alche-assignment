import { describe, it, expect, beforeEach } from "vitest";
import { SequenceBuffer } from "@/lib/ws/sequenceBuffer";
import type { ServerMessage } from "@/lib/ws/types";

function token(seq: number, text?: string): ServerMessage {
  return { type: "TOKEN", seq, text: text ?? `t${seq}`, stream_id: "s1" };
}

function toolCall(seq: number, callId: string): ServerMessage {
  return {
    type: "TOOL_CALL",
    seq,
    call_id: callId,
    tool_name: "test_tool",
    args: {},
    stream_id: "s1",
  };
}

describe("SequenceBuffer", () => {
  let buf: SequenceBuffer;

  beforeEach(() => {
    buf = new SequenceBuffer();
  });

  it("empty buffer returns defaults", () => {
    expect(buf.size()).toBe(0);
    expect(buf.getLastProcessed()).toBe(0);
    expect(buf.nextExpected()).toBe(1);
  });

  it("single in-order message drains immediately", () => {
    const accepted = buf.insert(token(1));
    expect(accepted).toBe(true);
    const out = buf.drain();
    expect(out).toHaveLength(1);
    expect(out[0].seq).toBe(1);
    expect(buf.getLastProcessed()).toBe(1);
    expect(buf.nextExpected()).toBe(2);
  });

  it("sequential messages drain one at a time", () => {
    expect(buf.insert(token(1))).toBe(true);
    expect(buf.drain().map((m) => m.seq)).toEqual([1]);

    expect(buf.insert(token(2))).toBe(true);
    expect(buf.drain().map((m) => m.seq)).toEqual([2]);

    expect(buf.insert(token(3))).toBe(true);
    expect(buf.drain().map((m) => m.seq)).toEqual([3]);

    expect(buf.getLastProcessed()).toBe(3);
  });

  it("out-of-order buffers until gap fills", () => {
    // insert seq 3 — missing 1, 2
    expect(buf.insert(token(3))).toBe(true);
    expect(buf.drain()).toHaveLength(0);
    expect(buf.size()).toBe(1);

    // insert seq 2 — still missing 1
    expect(buf.insert(token(2))).toBe(true);
    expect(buf.drain()).toHaveLength(0);
    expect(buf.size()).toBe(2);

    // insert seq 1 — fills gap, flushes 1 → 2 → 3
    expect(buf.insert(token(1))).toBe(true);
    const out = buf.drain();
    expect(out.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(buf.size()).toBe(0);
    expect(buf.getLastProcessed()).toBe(3);
  });

  it("fully reversed sequence flushes in order", () => {
    buf.insert(token(5));
    buf.insert(token(4));
    buf.insert(token(3));
    buf.insert(token(2));
    expect(buf.size()).toBe(4);
    expect(buf.drain()).toHaveLength(0);

    buf.insert(token(1));
    const out = buf.drain();
    expect(out.map((m) => m.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(buf.size()).toBe(0);
  });

  it("duplicate seq rejected on insert", () => {
    expect(buf.insert(token(1))).toBe(true);
    expect(buf.insert(token(1, "dup"))).toBe(false);
    expect(buf.drain()).toHaveLength(1);
  });

  it("duplicate out-of-order keeps original text", () => {
    buf.insert(token(3));
    buf.insert(token(2));
    // duplicate of 2 with different text — must be rejected
    expect(buf.insert(token(2, "overwrite"))).toBe(false);
    // still missing 1
    expect(buf.drain()).toHaveLength(0);

    buf.insert(token(1));
    const out = buf.drain();
    expect(out.map((m) => m.seq)).toEqual([1, 2, 3]);
    // original text "t2" preserved, not "overwrite"
    expect(out[1].text).toBe("t2");
  });

  it("flush returns buffered messages sorted by seq", () => {
    buf.insert(token(5));
    buf.insert(token(3));
    buf.insert(token(7));
    // gap at 1,2,4,6 — nothing drains
    expect(buf.drain()).toHaveLength(0);

    const out = buf.flush();
    expect(out.map((m) => m.seq)).toEqual([3, 5, 7]);
    expect(buf.size()).toBe(0);
    expect(buf.getLastProcessed()).toBe(7);
  });

  it("flush after partial drain works correctly", () => {
    buf.insert(token(1));
    buf.insert(token(3));
    buf.insert(token(2));
    expect(buf.drain().map((m) => m.seq)).toEqual([1, 2, 3]);
    // all cleared — heap empty
    expect(buf.size()).toBe(0);

    // new gap
    buf.insert(token(6));
    buf.insert(token(4));
    const flushed = buf.flush();
    expect(flushed.map((m) => m.seq)).toEqual([4, 6]);
    expect(buf.getLastProcessed()).toBe(6);
  });

  it("resetForReconnection preserves lastProcessed", () => {
    buf.insert(token(1));
    buf.insert(token(2));
    buf.drain();
    expect(buf.getLastProcessed()).toBe(2);

    buf.resetForReconnection();
    expect(buf.getLastProcessed()).toBe(2);
    expect(buf.size()).toBe(0);
    expect(buf.nextExpected()).toBe(3);
  });

  it("accepts new messages after reset for replay", () => {
    buf.insert(token(1));
    buf.insert(token(2));
    buf.drain();
    buf.resetForReconnection();

    // server replays starting from after lastProcessed (which is 2)
    expect(buf.insert(token(3))).toBe(true);
    const out = buf.drain();
    expect(out).toHaveLength(1);
    expect(out[0].seq).toBe(3);
  });

  it("mixed event types in buffer", () => {
    buf.insert(token(1));
    buf.insert(toolCall(3, "tc_01"));
    buf.insert(token(2));

    const out = buf.drain();
    expect(out).toHaveLength(3);
    expect(out[0].type).toBe("TOKEN");
    expect(out[1].type).toBe("TOKEN");
    expect(out[2].type).toBe("TOOL_CALL");
  });

  it("handles large burst without error", () => {
    const count = 1000;
    // insert all seqs 2..1000 (gap at 1)
    for (let i = count; i >= 2; i--) {
      buf.insert(token(i));
    }
    expect(buf.size()).toBe(count - 1);
    // nothing drains because seq 1 is missing
    expect(buf.drain()).toHaveLength(0);

    // fill gap at 1 — drains all buffered messages in order
    const inserted = buf.insert(token(1));
    expect(inserted).toBe(true);
    const out = buf.drain();
    expect(out).toHaveLength(count);
    expect(out[0].seq).toBe(1);
    expect(out[count - 1].seq).toBe(count);
  });
});
