/**
 * ZeroCode ACP SessionPort types — aligned with
 * `/workspace/zerocode/ZeroCode-ACP适配接口草案.md` §5.
 *
 * Prefixed / namespaced under this module so they do not collide with
 * legacy zcode-protocol / V4 session types still used by zcode-agent.
 */

/** Agent process lifecycle (draft §2.3). */
export type AgentStatus =
  | "Idle"
  | "Spawning"
  | "Initializing"
  | "Ready"
  | "SessionActive"
  | "Stopping"
  | "Failed";

export type PermissionMode = "ask" | "auto" | "yolo";

export interface McpServerConfig {
  name: string;
  /** Opaque ACP mcpServers entry; shape finalized with SDK. */
  [key: string]: unknown;
}

export interface PromptAttachment {
  /** First cut: path reference only. */
  path: string;
  mimeType?: string;
}

export interface OpenSessionInput {
  workspacePath: string;
  mcpServers?: McpServerConfig[];
  permissionMode?: PermissionMode;
  model?: string;
}

export interface PromptInput {
  text: string;
  attachments?: PromptAttachment[];
}

export interface SessionHandle {
  sessionId: string;
  workspacePath: string;
}

export interface PromptResult {
  sessionId: string;
  /** ACP stopReason when available. */
  stopReason?: string;
}

export type ConfigOptionId = "model" | "reasoning_effort";

export interface ConfigOption {
  id: string;
  value: string;
  [key: string]: unknown;
}

/** Projected UI events — not raw ACP frames. */
export type SessionUiEvent =
  | { type: "assistant_text_delta"; text: string }
  | { type: "assistant_thought_delta"; text: string }
  | {
      type: "tool_call_started";
      toolCallId: string;
      title: string;
      kind?: string;
      input?: unknown;
    }
  | {
      type: "tool_call_updated";
      toolCallId: string;
      status: string;
      output?: unknown;
    }
  | { type: "plan_updated"; plan: unknown }
  | {
      type: "permission_requested";
      requestId: string;
      toolName: string;
      detail?: unknown;
    }
  | { type: "turn_completed"; stopReason?: string }
  | { type: "error"; message: string; retriable: boolean }
  | { type: "agent_process_exited"; code: number | null; signal: string | null };

/**
 * UI-facing agent facade. Implementation speaks ACP over stdio;
 * callers must not assemble JSON-RPC themselves.
 */
export interface SessionPort {
  /** Ensure agent process is Ready; idempotent. */
  ensureReady(): Promise<void>;

  /** Create or reuse an ACP session for the workspace. */
  openSession(input: OpenSessionInput): Promise<SessionHandle>;

  /** Send user message; streaming results go through subscribe. */
  prompt(sessionId: string, input: PromptInput): Promise<PromptResult>;

  /** Stop current generation. */
  cancel(sessionId: string): Promise<void>;

  /** Permission decision for a pending request. */
  respondToPermission(
    sessionId: string,
    requestId: string,
    decision: "allow" | "deny" | "allow_always",
  ): Promise<void>;

  /** Change model / reasoning effort etc. */
  setConfigOption(
    sessionId: string,
    configId: ConfigOptionId,
    value: string,
  ): Promise<ConfigOption[]>;

  /** Subscribe to projected UI events (not raw ACP). */
  subscribe(sessionId: string, listener: (ev: SessionUiEvent) => void): () => void;

  getStatus(): AgentStatus;

  /**
   * Host auth / BYOK entry (MVP-2 card B).
   * Explains or applies BYOK via ~/.zerowork/config.toml; never opens grok.com / auth.x.ai.
   * May optionally call ACP `authenticate` with `{ methodId: "xai.api_key" }` when a key path exists.
   * Return shape: see `AuthenticateResult` in `./authSurface.js`.
   */
  authenticate(methodId?: string): Promise<AuthenticateResultLike>;
}

/** Minimal authenticate result shape (full fields in authSurface.AuthenticateResult). */
export interface AuthenticateResultLike {
  ok: boolean;
  code: string;
  message: string;
  methodId?: string;
  calledAcpAuthenticate: boolean;
  configPath: string;
  byokTemplate: string;
}
