/**
 * Host service: owns ZeroCodeAcpAdapter and projects SessionUiEvent over RPC.
 *
 * MVP-2 card A: this SessionPort facade is the default chat / new-session path
 * when `resolveHostDefaultAgentRuntime()` returns `zerocode-acp` (product default).
 * Renderer must not speak raw ACP; openSession keeps permissionMode ask/auto only
 * (no `--always-approve` unless a future Host API explicitly opts into yolo).
 */

import { Emitter, type Event } from "@zcode/rpc";
import { ZeroCodeAcpAdapter } from "../zerocode-acp/ZeroCodeAcpAdapter.js";
import {
  AuthCredentialsMissingError,
  projectAuthFailureToSessionUiEvent,
  type AuthenticateResult,
} from "../zerocode-acp/authSurface.js";
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
      try {
        const handle = await adapter.openSession({
          ...input,
          permissionMode: input.permissionMode === "auto" ? "auto" : "ask",
        });
        ensureAdapterSubscription(handle.sessionId);
        return handle;
      } catch (err) {
        // Auth signal is on session/new (no sessionId yet). Project same text UI already
        // shows via catch / getLastError; when a session later exists, error events work too.
        const authEvent =
          err instanceof AuthCredentialsMissingError
            ? err.sessionUiEvent
            : projectAuthFailureToSessionUiEvent(err);
        if (authEvent) {
          options.log?.(`[zerocode-session-port] auth error: ${authEvent.message}`);
          // No session emitter yet — lastError carries the projected message for UI.
        }
        throw err;
      }
    },

    async prompt(sessionId: string, input: PromptInput): Promise<PromptResult> {
      ensureAdapterSubscription(sessionId);
      try {
        return await adapter.prompt(sessionId, input);
      } catch (err) {
        // Adapter already emits SessionUiEvent error for auth-shaped failures via
        // adapter.subscribe → Host emitter. For non-auth errors (legacy path), fire here.
        if (!(err instanceof AuthCredentialsMissingError)) {
          const authEvent = projectAuthFailureToSessionUiEvent(err);
          const message =
            authEvent?.message ??
            (err instanceof Error ? err.message : String(err));
          getEmitter(sessionId).fire(
            authEvent ?? { type: "error", message, retriable: true },
          );
        }
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

    async authenticate(methodId?: string): Promise<AuthenticateResult> {
      return adapter.authenticate(methodId);
    },

    onDynamicSessionUiEvent(sessionId: string): Event<SessionUiEvent> {
      ensureAdapterSubscription(sessionId);
      return getEmitter(sessionId).event;
    },
  };
}
