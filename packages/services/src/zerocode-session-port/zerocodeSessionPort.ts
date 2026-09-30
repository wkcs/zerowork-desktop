/**
 * Host-facing ZeroCode SessionPort RPC surface (MVP-1 card 3).
 *
 * Wraps ZeroCodeAcpAdapter behind a ProxyChannel-friendly service so Renderer
 * talks Host only — never raw ACP / JSON-RPC.
 *
 * Lives OUTSIDE packages/services/src/zerocode-acp/ (card 2 freeze).
 */

import type { Event } from "@zcode/rpc";
import { createServiceDescriptor } from "../descriptors.js";
import type {
  AgentStatus,
  OpenSessionInput,
  PromptInput,
  PromptResult,
  SessionHandle,
  SessionUiEvent,
} from "../zerocode-acp/types.js";
import type { AuthenticateResult } from "../zerocode-acp/authSurface.js";

/**
 * Keep in sync with `ServiceChannels.ZeroCodeSessionPort` in
 * `packages/shared/src/channels.ts`.
 */
export const ZEROCODE_SESSION_PORT_CHANNEL = "zerocode-session-port";

/** Card 3 permission: ask | auto only — never yolo / --always-approve by default. */
export type ZeroCodeSessionPortPermissionMode = "ask" | "auto";

export type ZeroCodeSessionPortOpenInput = Omit<OpenSessionInput, "permissionMode"> & {
  permissionMode?: ZeroCodeSessionPortPermissionMode;
};

export type {
  AgentStatus,
  PromptInput,
  PromptResult,
  SessionHandle,
  SessionUiEvent,
};

export type { AuthenticateResult };

/**
 * Thin Host RPC facade over SessionPort.
 * Methods are sync-or-async on Host; ProxyChannel always awaits on Renderer.
 */
export interface IZeroCodeSessionPortService {
  ensureReady(): Promise<void>;
  openSession(input: ZeroCodeSessionPortOpenInput): Promise<SessionHandle>;
  prompt(sessionId: string, input: PromptInput): Promise<PromptResult>;
  cancel(sessionId: string): Promise<void>;
  getStatus(): AgentStatus;
  getLastError(): string | null;
  /**
   * Host auth / BYOK guidance (MVP-2 card B).
   * Never opens grok.com browser auth. May call ACP authenticate { methodId: "xai.api_key" }
   * only when config.toml already has a BYOK key path.
   */
  authenticate(methodId?: string): Promise<AuthenticateResult>;
  /**
   * Persist ZeroCode BYOK api_key into ~/.zerowork/config.toml (Host auth surface).
   * Does not open grok.com / z.ai purchase URLs.
   */
  saveByokApiKey(apiKey: string): Promise<{ configPath: string }>;
  /** Per-session projected UI events (not raw ACP). */
  onDynamicSessionUiEvent(sessionId: string): Event<SessionUiEvent>;
}

export const IZeroCodeSessionPortService = createServiceDescriptor<IZeroCodeSessionPortService>(
  ZEROCODE_SESSION_PORT_CHANNEL,
);
