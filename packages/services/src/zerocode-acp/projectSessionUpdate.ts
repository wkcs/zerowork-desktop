/**
 * Project ACP `session/update` notification params → SessionUiEvent[].
 *
 * Wire shape (agent-client-protocol SessionNotification / grok-build 1.0.45):
 *   { sessionId, update: { sessionUpdate, content?, toolCallId?, ... } }
 *
 * Flat legacy (rare) also tolerated:
 *   { sessionId, sessionUpdate, content?, ... }
 */

import type { SessionUiEvent } from "./types.js";

export interface ProjectedSessionUpdate {
  sessionId: string;
  events: SessionUiEvent[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** Extract text from ACP content block `{ type: "text", text: "..." }`. */
export function extractTextContent(content: unknown): string {
  const rec = asRecord(content);
  if (!rec) return "";
  return typeof rec.text === "string" ? rec.text : "";
}

/**
 * Normalize notification params into sessionId + update body.
 * Returns null when sessionId or sessionUpdate cannot be resolved.
 */
export function unwrapSessionUpdateParams(params: unknown): {
  sessionId: string;
  update: Record<string, unknown>;
} | null {
  const root = asRecord(params);
  if (!root) return null;

  const sessionId = typeof root.sessionId === "string" ? root.sessionId : "";
  if (!sessionId) return null;

  const nested = asRecord(root.update);
  const update = nested ?? root;
  const sessionUpdate = update.sessionUpdate;
  if (typeof sessionUpdate !== "string" || !sessionUpdate) {
    return null;
  }

  return { sessionId, update };
}

/** Map one ACP session/update params object to zero-or-more UI events. */
export function projectSessionUpdate(params: unknown): ProjectedSessionUpdate | null {
  const unwrapped = unwrapSessionUpdateParams(params);
  if (!unwrapped) return null;

  const { sessionId, update } = unwrapped;
  const sessionUpdate = update.sessionUpdate as string;
  const events: SessionUiEvent[] = [];

  switch (sessionUpdate) {
    case "agent_message_chunk":
      events.push({
        type: "assistant_text_delta",
        text: extractTextContent(update.content),
      });
      break;
    case "agent_thought_chunk":
      events.push({
        type: "assistant_thought_delta",
        text: extractTextContent(update.content),
      });
      break;
    case "tool_call":
      events.push({
        type: "tool_call_started",
        toolCallId: typeof update.toolCallId === "string" ? update.toolCallId : "",
        title: typeof update.title === "string" ? update.title : "",
        kind: typeof update.kind === "string" ? update.kind : undefined,
        input: update.rawInput,
      });
      break;
    case "tool_call_update":
      events.push({
        type: "tool_call_updated",
        toolCallId: typeof update.toolCallId === "string" ? update.toolCallId : "",
        status: typeof update.status === "string" ? update.status : "",
        output: update.rawOutput,
      });
      break;
    case "plan":
      events.push({ type: "plan_updated", plan: update.plan });
      break;
    case "turn_completed": {
      const stopReason =
        typeof update.stopReason === "string"
          ? update.stopReason
          : typeof update.stop_reason === "string"
            ? update.stop_reason
            : undefined;
      events.push({ type: "turn_completed", stopReason });
      break;
    }
    default: {
      // Permission-shaped fallback (non-standard nesting may appear on some builds)
      if (typeof update.requestId === "string" && typeof update.toolName === "string") {
        events.push({
          type: "permission_requested",
          requestId: update.requestId,
          toolName: update.toolName,
          detail: update,
        });
      }
      break;
    }
  }

  return { sessionId, events };
}
