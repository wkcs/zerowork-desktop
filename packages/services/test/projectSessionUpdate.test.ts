import assert from "node:assert/strict";
import test from "node:test";
import {
  extractTextContent,
  projectSessionUpdate,
  unwrapSessionUpdateParams,
} from "../src/zerocode-acp/projectSessionUpdate.js";

test("unwrap prefers nested params.update (real ACP SessionNotification)", () => {
  const nested = unwrapSessionUpdateParams({
    sessionId: "sess-1",
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "pong" },
    },
  });
  assert.ok(nested);
  assert.equal(nested!.sessionId, "sess-1");
  assert.equal(nested!.update.sessionUpdate, "agent_message_chunk");
});

test("unwrap tolerates flat legacy params", () => {
  const flat = unwrapSessionUpdateParams({
    sessionId: "sess-2",
    sessionUpdate: "agent_thought_chunk",
    content: { type: "text", text: "hmm" },
  });
  assert.ok(flat);
  assert.equal(flat!.update.sessionUpdate, "agent_thought_chunk");
});

test("extractTextContent reads content.text", () => {
  assert.equal(extractTextContent({ type: "text", text: "hi" }), "hi");
  assert.equal(extractTextContent(null), "");
  assert.equal(extractTextContent({ type: "text" }), "");
});

test("project nested agent_message_chunk → assistant_text_delta", () => {
  const projected = projectSessionUpdate({
    sessionId: "s",
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "pong" },
    },
  });
  assert.deepEqual(projected, {
    sessionId: "s",
    events: [{ type: "assistant_text_delta", text: "pong" }],
  });
});

test("project nested agent_thought_chunk → assistant_thought_delta", () => {
  const projected = projectSessionUpdate({
    sessionId: "s",
    update: {
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: "think" },
    },
  });
  assert.deepEqual(projected!.events, [
    { type: "assistant_thought_delta", text: "think" },
  ]);
});

test("project tool_call / tool_call_update / plan / turn_completed", () => {
  assert.deepEqual(
    projectSessionUpdate({
      sessionId: "s",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "tc1",
        title: "Read",
        kind: "read",
        rawInput: { path: "/a" },
      },
    })!.events[0],
    {
      type: "tool_call_started",
      toolCallId: "tc1",
      title: "Read",
      kind: "read",
      input: { path: "/a" },
    },
  );

  assert.deepEqual(
    projectSessionUpdate({
      sessionId: "s",
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "tc1",
        status: "completed",
        rawOutput: "ok",
      },
    })!.events[0],
    {
      type: "tool_call_updated",
      toolCallId: "tc1",
      status: "completed",
      output: "ok",
    },
  );

  assert.deepEqual(
    projectSessionUpdate({
      sessionId: "s",
      update: { sessionUpdate: "plan", plan: [{ step: 1 }] },
    })!.events[0],
    { type: "plan_updated", plan: [{ step: 1 }] },
  );

  assert.deepEqual(
    projectSessionUpdate({
      sessionId: "s",
      update: {
        sessionUpdate: "turn_completed",
        stopReason: "end_turn",
      },
    })!.events[0],
    { type: "turn_completed", stopReason: "end_turn" },
  );

  // snake_case stop_reason tolerance (harness / extension payloads)
  assert.deepEqual(
    projectSessionUpdate({
      sessionId: "s",
      update: {
        sessionUpdate: "turn_completed",
        stop_reason: "cancelled",
      },
    })!.events[0],
    { type: "turn_completed", stopReason: "cancelled" },
  );
});

test("project returns null when sessionId or sessionUpdate missing", () => {
  assert.equal(projectSessionUpdate({ update: { sessionUpdate: "agent_message_chunk" } }), null);
  assert.equal(projectSessionUpdate({ sessionId: "s", update: {} }), null);
  assert.equal(projectSessionUpdate(null), null);
});

test("flat agent_message_chunk still projects (legacy tolerance)", () => {
  const projected = projectSessionUpdate({
    sessionId: "flat",
    sessionUpdate: "agent_message_chunk",
    content: { type: "text", text: "legacy" },
  });
  assert.deepEqual(projected!.events, [
    { type: "assistant_text_delta", text: "legacy" },
  ]);
});
