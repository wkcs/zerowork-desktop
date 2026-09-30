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
 * - Card 3: session/prompt + project session/update (nested params.update)
 * - Does NOT wire UI hooks / Renderer ACP as default Host path
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
import { projectSessionUpdate } from "./projectSessionUpdate.js";
import {
  ACP_AUTH_METHOD_GROK_COM,
  ACP_AUTH_METHOD_XAI_API_KEY,
  AUTH_CREDENTIALS_MISSING_CODE,
  AuthCredentialsMissingError,
  advertisesXaiApiKey,
  buildAuthenticateGuidanceResult,
  buildByokConfigGuidance,
  hasByokKeyPathInConfig,
  parseInitializeAuthSnapshot,
  projectAuthFailureToSessionUiEvent,
  shouldSkipAuthenticate,
  toAuthCredentialsMissingError,
  type AuthenticateResult,
  type InitializeAuthSnapshot,
} from "./authSurface.js";
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
  /**
   * When true, log raw session/update notification params (shape debug for card 3).
   * Never use for production UI; may include assistant text.
   */
  debugSessionUpdates?: boolean;
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
  /** Captured from ACP initialize (authMethods / defaultAuthMethodId). */
  private initializeAuth: InitializeAuthSnapshot | null = null;

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

    const initResult = await transport.request("initialize", {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: DEFAULT_CLIENT_CAPABILITIES,
    });
    this.initializeAuth = parseInitializeAuthSnapshot(initResult);
    this.options.log?.(
      `[zerocode-acp] initialize authMethods=${JSON.stringify(
        this.initializeAuth.authMethods.map((m) => m.id),
      )} defaultAuthMethodId=${this.initializeAuth.defaultAuthMethodId}`,
    );
  }

  getInitializeAuthSnapshot(): InitializeAuthSnapshot | null {
    return this.initializeAuth;
  }

  async openSession(input: OpenSessionInput): Promise<SessionHandle> {
    await this.ensureReady();
    if (!this.transport || this.transport.isClosed) {
      throw new Error("ZeroCode ACP transport not ready");
    }

    // Card B: if xai.api_key is not advertised, surface BYOK guidance (ignore grok.com).
    if (!advertisesXaiApiKey(this.initializeAuth)) {
      const guidance = buildByokConfigGuidance();
      const onlyGrok =
        this.initializeAuth != null &&
        this.initializeAuth.authMethods.length > 0 &&
        this.initializeAuth.authMethods.every((m) => m.id === ACP_AUTH_METHOD_GROK_COM);
      const extra = onlyGrok
        ? " Agent advertised only grok.com (ignored by ZeroWork Host)."
        : " Agent did not advertise xai.api_key.";
      const event: SessionUiEvent = {
        type: "error",
        message: `${guidance.message}${extra}`,
        retriable: true,
      };
      this.lastError = event.message;
      throw new AuthCredentialsMissingError(event);
    }

    // Optional ACP authenticate only when BYOK path exists and default is not already set.
    if (!shouldSkipAuthenticate(this.initializeAuth)) {
      if (hasByokKeyPathInConfig()) {
        await this.authenticate(ACP_AUTH_METHOD_XAI_API_KEY);
      } else {
        // Key path missing even though method advertised — still try session/new;
        // auth-shaped RPC error will be projected below.
        this.options.log?.(
          "[zerocode-acp] xai.api_key advertised but no BYOK api_key in config.toml; skipping authenticate",
        );
      }
    }

    const meta: Record<string, unknown> = {
      ...(buildSessionNewMeta(input.permissionMode) ?? {}),
    };
    if (input.model) {
      meta.model = input.model;
    }

    let result: { sessionId?: string };
    try {
      result = (await this.transport.request("session/new", {
        cwd: input.workspacePath,
        mcpServers: input.mcpServers ?? [],
        ...(Object.keys(meta).length > 0 ? { _meta: meta } : {}),
      })) as { sessionId?: string };
    } catch (err) {
      const authErr = toAuthCredentialsMissingError(err);
      if (authErr) {
        this.lastError = authErr.message;
        // No session yet — callers (SessionPort service / UI catch) surface the message.
        // Projection shape matches SessionUiEvent error for unit tests / later emit.
        throw authErr;
      }
      throw err;
    }

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

    let result: { stopReason?: string };
    try {
      result = (await this.transport.request("session/prompt", {
        sessionId,
        prompt: content,
      })) as { stopReason?: string };
    } catch (err) {
      const authEvent = projectAuthFailureToSessionUiEvent(err);
      if (authEvent) {
        this.lastError = authEvent.message;
        this.emit(sessionId, authEvent);
        throw new AuthCredentialsMissingError(authEvent);
      }
      const message = err instanceof Error ? err.message : String(err);
      this.emit(sessionId, { type: "error", message, retriable: true });
      throw err instanceof Error ? err : new Error(message);
    }

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

  /**
   * Host auth / BYOK entry (MVP-2 card B).
   * - Never opens grok.com / auth.x.ai browser login.
   * - If methodId is grok.com (or omitted while only grok.com advertised): return guidance.
   * - If BYOK missing: return AUTH_CREDENTIALS_MISSING / AUTH_BYOK_GUIDANCE (do not write keys).
   * - If defaultAuthMethodId already xai.api_key: skip ACP authenticate.
   * - Else with BYOK present: call ACP `authenticate` { methodId: "xai.api_key" }.
   */
  async authenticate(methodId?: string): Promise<AuthenticateResult> {
    await this.ensureReady();
    const guidanceBase = buildAuthenticateGuidanceResult(this.initializeAuth);

    const requested =
      typeof methodId === "string" && methodId.trim()
        ? methodId.trim()
        : ACP_AUTH_METHOD_XAI_API_KEY;

    if (requested === ACP_AUTH_METHOD_GROK_COM) {
      return {
        ...guidanceBase,
        ok: false,
        code: AUTH_CREDENTIALS_MISSING_CODE,
        message:
          `${guidanceBase.message} Refused methodId=grok.com (ZeroWork Host does not use browser OAuth).`,
        methodId: requested,
        calledAcpAuthenticate: false,
      };
    }

    if (requested !== ACP_AUTH_METHOD_XAI_API_KEY) {
      return {
        ...guidanceBase,
        ok: false,
        code: "AUTH_METHOD_UNAVAILABLE",
        message: `${guidanceBase.message} Unsupported auth methodId=${requested}; only xai.api_key is supported.`,
        methodId: requested,
        calledAcpAuthenticate: false,
      };
    }

    if (!advertisesXaiApiKey(this.initializeAuth)) {
      this.lastError = guidanceBase.message;
      return guidanceBase;
    }

    if (shouldSkipAuthenticate(this.initializeAuth)) {
      return {
        ...guidanceBase,
        ok: true,
        code: "AUTH_SKIPPED_DEFAULT",
        message:
          "initialize _meta.defaultAuthMethodId is already xai.api_key; ACP authenticate not required.",
        methodId: ACP_AUTH_METHOD_XAI_API_KEY,
        calledAcpAuthenticate: false,
      };
    }

    if (!hasByokKeyPathInConfig()) {
      const guidance = buildByokConfigGuidance();
      const result: AuthenticateResult = {
        ok: false,
        code: "AUTH_BYOK_GUIDANCE",
        message: `${guidance.message} Write BYOK to config.toml before calling authenticate.`,
        methodId: ACP_AUTH_METHOD_XAI_API_KEY,
        calledAcpAuthenticate: false,
        configPath: guidance.configPath,
        byokTemplate: guidance.byokTemplate,
      };
      this.lastError = result.message;
      return result;
    }

    if (!this.transport || this.transport.isClosed) {
      throw new Error("ZeroCode ACP transport not ready");
    }

    try {
      await this.transport.request("authenticate", {
        methodId: ACP_AUTH_METHOD_XAI_API_KEY,
      });
    } catch (err) {
      const authErr = toAuthCredentialsMissingError(err);
      if (authErr) {
        this.lastError = authErr.message;
        return {
          ok: false,
          code: AUTH_CREDENTIALS_MISSING_CODE,
          message: authErr.message,
          methodId: ACP_AUTH_METHOD_XAI_API_KEY,
          calledAcpAuthenticate: true,
          configPath: guidanceBase.configPath,
          byokTemplate: guidanceBase.byokTemplate,
        };
      }
      throw err;
    }

    return {
      ok: true,
      code: "AUTH_APPLIED",
      message: "ACP authenticate applied with methodId xai.api_key (BYOK via config.toml).",
      methodId: ACP_AUTH_METHOD_XAI_API_KEY,
      calledAcpAuthenticate: true,
      configPath: guidanceBase.configPath,
      byokTemplate: guidanceBase.byokTemplate,
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
    this.initializeAuth = null;
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
    if (this.options.debugSessionUpdates) {
      try {
        this.options.log?.(
          `[zerocode-acp:debug] session/update params=${JSON.stringify(params)}`,
        );
      } catch {
        this.options.log?.("[zerocode-acp:debug] session/update params=(unserializable)");
      }
    }
    const projected = projectSessionUpdate(params);
    if (!projected) {
      this.options.log?.("[zerocode-acp] session/update missing sessionId or sessionUpdate");
      return;
    }
    for (const ev of projected.events) {
      this.emit(projected.sessionId, ev);
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
