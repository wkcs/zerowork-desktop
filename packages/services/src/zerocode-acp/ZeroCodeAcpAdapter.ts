/**
 * ZeroCodeAcpAdapter — Host↔ACP SessionPort skeleton (MVP-1 card 2).
 *
 * State machine: Idle → Spawning → Initializing → Ready → SessionActive → Stopping → Idle
 *                               ↘ Failed ←──────────────────────────────────────────┘
 *
 * Card 2 scope:
 * - Compilable SessionPort surface + spawn/initialize skeleton
 * - Missing binary → Failed with clear error (no fake stream / fake success)
 * - If binary exists: may spawn + initialize (protocolVersion 1 + fs/terminal caps)
 * - Does NOT wire UI hooks / Renderer ACP / claim card-3 dialogue loop
 * - Does NOT replace ZCODE_AGENT_RUNTIME / zcodeAgentProcessManager default path
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { JsonRpcStdioTransport } from "./jsonRpcStdio.js";
import {
  resolveZeroCodeBin,
  ZeroCodeBinNotFoundError,
  type ResolveZeroCodeBinOptions,
} from "./resolveZeroCodeBin.js";
import { buildSessionNewMeta, buildZeroCodeAgentSpawnSpec } from "./spawnSpec.js";
import type {
  AgentStatus,
  ConfigOption,
  ConfigOptionId,
  OpenSessionInput,
  PromptInput,
  PromptResult,
  SessionHandle,
  SessionPort,
  SessionUiEvent,
} from "./types.js";

const ACP_PROTOCOL_VERSION = 1;

const DEFAULT_CLIENT_CAPABILITIES = {
  fs: { readTextFile: true, writeTextFile: true },
  terminal: true,
} as const;

export interface ZeroCodeAcpAdapterOptions {
  /** Injected into resolveZeroCodeBin (tests / non-Electron). */
  resolveBinOptions?: ResolveZeroCodeBinOptions;
  /** Override spawn; default node child_process.spawn. */
  spawnFn?: typeof spawn;
  /** Logger sink for stderr lines and adapter diagnostics. */
  log?: (line: string) => void;
  /** Optional default model passed at spawn when openSession does not override. */
  defaultModel?: string;
  /**
   * When true, ensureReady will attempt spawn+initialize if the binary exists.
   * When false (default for pure unit tests of status), resolve-only.
   * Production Host should leave this true (default).
   */
  attemptInitialize?: boolean;
}

interface ActiveSession {
  sessionId: string;
  workspacePath: string;
  listeners: Set<(ev: SessionUiEvent) => void>;
}

export class ZeroCodeAcpAdapter implements SessionPort {
  private status: AgentStatus = "Idle";
  private lastError: string | null = null;
  private child: ChildProcessWithoutNullStreams | null = null;
  private transport: JsonRpcStdioTransport | null = null;
  private sessions = new Map<string, ActiveSession>();
  private readyPromise: Promise<void> | null = null;

  constructor(private readonly options: ZeroCodeAcpAdapterOptions = {}) {}

  getStatus(): AgentStatus {
    return this.status;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  async ensureReady(): Promise<void> {
    if (this.status === "Ready" || this.status === "SessionActive") {
      return;
    }
    if (this.readyPromise) {
      return this.readyPromise;
    }
    this.readyPromise = this.doEnsureReady().finally(() => {
      this.readyPromise = null;
    });
    return this.readyPromise;
  }

  private async doEnsureReady(): Promise<void> {
    let binPath: string;
    try {
      binPath = resolveZeroCodeBin(this.options.resolveBinOptions).path;
    } catch (err) {
      const message =
        err instanceof ZeroCodeBinNotFoundError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      this.transition("Failed", message);
      throw err instanceof Error ? err : new Error(message);
    }

    const attemptInitialize = this.options.attemptInitialize !== false;
    if (!attemptInitialize) {
      // Resolve-only path for callers that only need bin discovery.
      this.transition("Ready");
      return;
    }

    this.transition("Spawning");
    try {
      await this.spawnAndInitialize(binPath);
      this.transition("Ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.killChild();
      this.transition("Failed", message);
      throw err instanceof Error ? err : new Error(message);
    }
  }

  private async spawnAndInitialize(binPath: string): Promise<void> {
    const spec = buildZeroCodeAgentSpawnSpec({
      cwd: process.cwd(),
      bin: binPath,
      model: this.options.defaultModel,
      // Default: no --always-approve
    });

    const spawnFn = this.options.spawnFn ?? spawn;
    const child = spawnFn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: { ...process.env, ...spec.env },
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;

    this.child = child;
    this.transition("Initializing");

    const transport = new JsonRpcStdioTransport(child, {
      onStderrLine: (line) => this.options.log?.(`[zerocode-acp:stderr] ${line}`),
      onNotification: (method, params) => this.handleNotification(method, params),
      onClose: (info) => this.handleProcessExit(info),
    });
    this.transport = transport;

    await transport.request("initialize", {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: DEFAULT_CLIENT_CAPABILITIES,
    });
  }

  async openSession(input: OpenSessionInput): Promise<SessionHandle> {
    await this.ensureReady();
    if (!this.transport || this.transport.isClosed) {
      throw new Error("ZeroCode ACP transport not ready");
    }

    const meta: Record<string, unknown> = {
      ...(buildSessionNewMeta(input.permissionMode) ?? {}),
    };
    if (input.model) {
      meta.model = input.model;
    }
    const result = (await this.transport.request("session/new", {
      cwd: input.workspacePath,
      mcpServers: input.mcpServers ?? [],
      ...(Object.keys(meta).length > 0 ? { _meta: meta } : {}),
    })) as { sessionId?: string };

    const sessionId = result?.sessionId;
    if (!sessionId || typeof sessionId !== "string") {
      throw new Error("session/new did not return sessionId");
    }

    this.sessions.set(sessionId, {
      sessionId,
      workspacePath: input.workspacePath,
      listeners: new Set(),
    });
    this.transition("SessionActive");
    return { sessionId, workspacePath: input.workspacePath };
  }

  async prompt(sessionId: string, input: PromptInput): Promise<PromptResult> {
    this.requireSession(sessionId);
    if (!this.transport || this.transport.isClosed) {
      throw new Error("ZeroCode ACP transport not ready");
    }

    const content: Array<{ type: string; text?: string; path?: string }> = [
      { type: "text", text: input.text },
    ];
    for (const att of input.attachments ?? []) {
      content.push({ type: "resource", path: att.path });
    }

    const result = (await this.transport.request("session/prompt", {
      sessionId,
      prompt: content,
    })) as { stopReason?: string };

    this.emit(sessionId, {
      type: "turn_completed",
      stopReason: result?.stopReason,
    });

    return { sessionId, stopReason: result?.stopReason };
  }

  async cancel(sessionId: string): Promise<void> {
    this.requireSession(sessionId);
    if (!this.transport || this.transport.isClosed) {
      return;
    }
    try {
      await this.transport.request("session/cancel", { sessionId });
    } catch (err) {
      this.options.log?.(
        `[zerocode-acp] session/cancel failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async respondToPermission(
    sessionId: string,
    requestId: string,
    decision: "allow" | "deny" | "allow_always",
  ): Promise<void> {
    this.requireSession(sessionId);
    if (!this.transport || this.transport.isClosed) {
      throw new Error("ZeroCode ACP transport not ready");
    }
    // Method name follows draft: Host-layer respondToPermission;
    // wire method may be refined when SDK is locked (card 3+).
    await this.transport.request("session/request_permission_response", {
      sessionId,
      requestId,
      decision,
    });
  }

  async setConfigOption(
    sessionId: string,
    configId: ConfigOptionId,
    value: string,
  ): Promise<ConfigOption[]> {
    this.requireSession(sessionId);
    if (!this.transport || this.transport.isClosed) {
      throw new Error("ZeroCode ACP transport not ready");
    }
    const result = (await this.transport.request("session/set_config_option", {
      sessionId,
      configId,
      value,
    })) as { configOptions?: ConfigOption[] } | ConfigOption[];

    if (Array.isArray(result)) {
      return result;
    }
    return result?.configOptions ?? [{ id: configId, value }];
  }

  subscribe(sessionId: string, listener: (ev: SessionUiEvent) => void): () => void {
    const session = this.requireSession(sessionId);
    session.listeners.add(listener);
    return () => {
      session.listeners.delete(listener);
    };
  }

  /** Graceful shutdown of the agent process. */
  async stop(): Promise<void> {
    if (this.status === "Idle" || this.status === "Failed") {
      this.killChild();
      this.transition("Idle");
      return;
    }
    this.transition("Stopping");
    this.killChild();
    this.sessions.clear();
    this.transition("Idle");
  }

  private requireSession(sessionId: string): ActiveSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown ACP session: ${sessionId}`);
    }
    return session;
  }

  private emit(sessionId: string, ev: SessionUiEvent): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    for (const listener of session.listeners) {
      try {
        listener(ev);
      } catch (err) {
        this.options.log?.(
          `[zerocode-acp] listener error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private emitAll(ev: SessionUiEvent): void {
    for (const sessionId of this.sessions.keys()) {
      this.emit(sessionId, ev);
    }
  }

  private handleNotification(method: string, params: unknown): void {
    if (method !== "session/update") {
      this.options.log?.(`[zerocode-acp] unhandled notification: ${method}`);
      return;
    }
    const body = params as {
      sessionId?: string;
      sessionUpdate?: string;
      content?: { text?: string };
      toolCallId?: string;
      title?: string;
      kind?: string;
      rawInput?: unknown;
      status?: string;
      rawOutput?: unknown;
      plan?: unknown;
      // permission-shaped
      requestId?: string;
      toolName?: string;
    };
    const sessionId = body?.sessionId;
    if (!sessionId) return;

    const update = body.sessionUpdate;
    switch (update) {
      case "agent_message_chunk":
        this.emit(sessionId, {
          type: "assistant_text_delta",
          text: body.content?.text ?? "",
        });
        break;
      case "agent_thought_chunk":
        this.emit(sessionId, {
          type: "assistant_thought_delta",
          text: body.content?.text ?? "",
        });
        break;
      case "tool_call":
        this.emit(sessionId, {
          type: "tool_call_started",
          toolCallId: body.toolCallId ?? "",
          title: body.title ?? "",
          kind: body.kind,
          input: body.rawInput,
        });
        break;
      case "tool_call_update":
        this.emit(sessionId, {
          type: "tool_call_updated",
          toolCallId: body.toolCallId ?? "",
          status: body.status ?? "",
          output: body.rawOutput,
        });
        break;
      case "plan":
        this.emit(sessionId, { type: "plan_updated", plan: body.plan });
        break;
      default:
        if (body.requestId && body.toolName) {
          this.emit(sessionId, {
            type: "permission_requested",
            requestId: body.requestId,
            toolName: body.toolName,
            detail: body,
          });
        }
        break;
    }
  }

  private handleProcessExit(info: {
    code: number | null;
    signal: NodeJS.Signals | null;
    reason?: string;
  }): void {
    this.emitAll({
      type: "agent_process_exited",
      code: info.code,
      signal: info.signal,
    });
    this.transport = null;
    this.child = null;
    if (this.status !== "Stopping" && this.status !== "Idle") {
      this.transition(
        "Failed",
        info.reason ?? `Agent process exited (code=${info.code}, signal=${info.signal})`,
      );
    }
  }

  private killChild(): void {
    this.transport?.dispose();
    this.transport = null;
    if (this.child && !this.child.killed) {
      try {
        this.child.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
    this.child = null;
  }

  private transition(next: AgentStatus, errorMessage?: string): void {
    this.status = next;
    if (next === "Failed") {
      this.lastError = errorMessage ?? "Unknown failure";
      this.options.log?.(`[zerocode-acp] Failed: ${this.lastError}`);
    } else if (next === "Idle" || next === "Ready") {
      this.lastError = null;
    }
  }
}
