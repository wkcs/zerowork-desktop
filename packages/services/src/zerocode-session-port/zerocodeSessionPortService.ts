/**
 * Host service: owns ZeroCodeAcpAdapter and projects SessionUiEvent over RPC.
 */

import { Emitter, type Event } from "@zcode/rpc";
import { ZeroCodeAcpAdapter } from "../zerocode-acp/ZeroCodeAcpAdapter.js";
import type {
  AgentStatus,
  PromptInput,
  PromptResult,
  SessionHandle,
  SessionUiEvent,
} from "../zerocode-acp/types.js";
import type {
  IZeroCodeSessionPortService,
  ZeroCodeSessionPortOpenInput,
} from "./zerocodeSessionPort.js";

export interface CreateZeroCodeSessionPortServiceOptions {
  /** Logger sink (Host log line). */
  log?: (line: string) => void;
  /** Optional default model for spawn when openSession omits model. */
  defaultModel?: string;
}

export function createZeroCodeSessionPortService(
  options: CreateZeroCodeSessionPortServiceOptions = {},
): IZeroCodeSessionPortService {
  const adapter = new ZeroCodeAcpAdapter({
    attemptInitialize: true,
    log: options.log,
    defaultModel: options.defaultModel,
  });

  const emitters = new Map<string, Emitter<SessionUiEvent>>();
  const unsubscribes = new Map<string, () => void>();

  function getEmitter(sessionId: string): Emitter<SessionUiEvent> {
    let emitter = emitters.get(sessionId);
    if (!emitter) {
      emitter = new Emitter<SessionUiEvent>({
        onDidRemoveLastListener: () => {
          emitters.delete(sessionId);
          const unsub = unsubscribes.get(sessionId);
          if (unsub) {
            unsub();
            unsubscribes.delete(sessionId);
          }
          emitter?.dispose();
        },
      });
      emitters.set(sessionId, emitter);
    }
    return emitter;
  }

  function ensureAdapterSubscription(sessionId: string): void {
    if (unsubscribes.has(sessionId)) return;
    const unsub = adapter.subscribe(sessionId, (ev) => {
      const current = emitters.get(sessionId);
      current?.fire(ev);
    });
    unsubscribes.set(sessionId, unsub);
  }

  return {
    async ensureReady(): Promise<void> {
      await adapter.ensureReady();
    },

    async openSession(input: ZeroCodeSessionPortOpenInput): Promise<SessionHandle> {
      // Card 3: never pass yolo; default ask (no --always-approve).
      const handle = await adapter.openSession({
        ...input,
        permissionMode: input.permissionMode === "auto" ? "auto" : "ask",
      });
      ensureAdapterSubscription(handle.sessionId);
      return handle;
    },

    async prompt(sessionId: string, input: PromptInput): Promise<PromptResult> {
      ensureAdapterSubscription(sessionId);
      try {
        return await adapter.prompt(sessionId, input);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        getEmitter(sessionId).fire({
          type: "error",
          message,
          retriable: true,
        });
        throw err;
      }
    },

    async cancel(sessionId: string): Promise<void> {
      await adapter.cancel(sessionId);
    },

    getStatus(): AgentStatus {
      return adapter.getStatus();
    },

    getLastError(): string | null {
      return adapter.getLastError();
    },

    onDynamicSessionUiEvent(sessionId: string): Event<SessionUiEvent> {
      ensureAdapterSubscription(sessionId);
      return getEmitter(sessionId).event;
    },
  };
}
