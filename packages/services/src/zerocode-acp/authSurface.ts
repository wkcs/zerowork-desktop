/**
 * MVP-2 card B: Host auth / BYOK surface for ZeroCode ACP.
 *
 * Locked contract (Backend):
 * - initialize may succeed with no creds; authMethods may only advertise grok.com
 *   (IGNORE grok.com / auth.x.ai — ZeroWork does not use browser OAuth).
 * - Auth failure signal is JSON-RPC error on session/new (NOT session/update):
 *   message ≈ "Authentication required", data ≈ "no auth method id provided".
 * - Project that to SessionUiEvent `{ type: "error", ... }` — never silent 401.
 * - Optional ACP `authenticate` params `{ methodId: "xai.api_key" }` only when a
 *   BYOK key path already exists. If initialize `_meta.defaultAuthMethodId` is
 *   already `xai.api_key`, skip calling authenticate first.
 * - BYOK lives in ~/.zerowork/config.toml (GROK_HOME may point at that dir).
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { JsonRpcStdioError } from "./jsonRpcStdio.js";
import type { SessionUiEvent } from "./types.js";

/** ACP auth method id for BYOK / API key (literal from agent initialize). */
export const ACP_AUTH_METHOD_XAI_API_KEY = "xai.api_key" as const;

/** Browser OAuth method — must never be invoked by Host. */
export const ACP_AUTH_METHOD_GROK_COM = "grok.com" as const;

/**
 * Stable code embedded in SessionPort `error.message` so UI can match without a
 * new event type. Prefer reusing existing `{ type: "error"; message; retriable }`.
 */
export const AUTH_CREDENTIALS_MISSING_CODE = "AUTH_CREDENTIALS_MISSING" as const;

export interface AcpAuthMethod {
  id: string;
  name?: string;
  description?: string;
}

export interface InitializeAuthSnapshot {
  authMethods: AcpAuthMethod[];
  /** From initialize `_meta.defaultAuthMethodId`; may be null. */
  defaultAuthMethodId: string | null;
}

export interface AuthenticateResult {
  /** Whether Host considers auth ready enough to attempt session/new. */
  ok: boolean;
  code:
    | typeof AUTH_CREDENTIALS_MISSING_CODE
    | "AUTH_BYOK_GUIDANCE"
    | "AUTH_APPLIED"
    | "AUTH_SKIPPED_DEFAULT"
    | "AUTH_METHOD_UNAVAILABLE";
  message: string;
  methodId?: string;
  /** True only when Host actually sent ACP `authenticate`. */
  calledAcpAuthenticate: boolean;
  /** Absolute path to agent config.toml (guidance). */
  configPath: string;
  /** Minimal BYOK TOML snippet (do not write secrets; guidance only). */
  byokTemplate: string;
}

const BYOK_TEMPLATE = `[model.wire-local]
name = "Wire Local"
base_url = "http://127.0.0.1:9/v1"
api_key = "<YOUR_API_KEY>"

[auth]
preferred_method = "api_key"
`;

/**
 * Agent data dir used by zerocode binary.
 * GROK_HOME points at the data dir itself (e.g. …/.zerowork);
 * otherwise `{ZEROWORK_DATA_BASE_DIR|HOME}/.zerowork`.
 */
export function resolveAgentDataDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const grokHome = env.GROK_HOME?.trim();
  if (grokHome) return grokHome;
  const base =
    env.ZEROWORK_DATA_BASE_DIR?.trim() ||
    env.HOME?.trim() ||
    homedir();
  return join(base, ".zerowork");
}

export function resolveAgentConfigTomlPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(resolveAgentDataDir(env), "config.toml");
}

/** User-facing guidance: where to put BYOK (verified fields from wire config). */
export function buildByokConfigGuidance(
  env: NodeJS.ProcessEnv = process.env,
): { configPath: string; message: string; byokTemplate: string } {
  const configPath = resolveAgentConfigTomlPath(env);
  const dataDir = resolveAgentDataDir(env);
  const message = [
    `[${AUTH_CREDENTIALS_MISSING_CODE}]`,
    "Missing API key / BYOK credentials for ZeroCode agent.",
    `Set a model api_key and [auth] preferred_method = "api_key" in ${configPath}`,
    `(data dir ${dataDir}; GROK_HOME may override).`,
    "Do not use grok.com / auth.x.ai browser login from ZeroWork Host.",
    "Prefer config.toml BYOK over a fake XAI_API_KEY env (fake env fails first-party probe and will not advertise xai.api_key).",
  ].join(" ");
  return { configPath, message, byokTemplate: BYOK_TEMPLATE };
}

function escapeTomlBasicString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * MVP-5 card 3: persist user BYOK into the same config.toml Host already reads
 * (`hasByokKeyPathInConfig` / AUTH_CREDENTIALS_MISSING guidance).
 * Does not invent OAuth; does not log the key.
 */
export function writeByokApiKeyToConfig(
  apiKey: string,
  env: NodeJS.ProcessEnv = process.env,
): { configPath: string } {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error("API key is empty");
  }
  const dataDir = resolveAgentDataDir(env);
  const configPath = resolveAgentConfigTomlPath(env);
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });

  const escaped = escapeTomlBasicString(trimmed);
  const fresh = `[model.zerocode]
name = "ZeroCode"
base_url = "http://127.0.0.1:9/v1"
api_key = "${escaped}"

[auth]
preferred_method = "api_key"
`;

  let existing = "";
  if (existsSync(configPath)) {
    try {
      existing = readFileSync(configPath, "utf8");
    } catch {
      existing = "";
    }
  }

  if (!existing.trim()) {
    writeFileSync(configPath, fresh, { encoding: "utf8", mode: 0o600 });
    return { configPath };
  }

  let next = existing;
  if (/^\s*api_key\s*=/m.test(next)) {
    next = next.replace(
      /^\s*api_key\s*=\s*(?:"[^"]*"|'[^']*')/m,
      `api_key = "${escaped}"`,
    );
  } else {
    next = `${next.trimEnd()}

[model.zerocode]
name = "ZeroCode"
base_url = "http://127.0.0.1:9/v1"
api_key = "${escaped}"
`;
  }

  if (/preferred_method\s*=/i.test(next)) {
    next = next.replace(
      /preferred_method\s*=\s*(?:"[^"]*"|'[^']*')/i,
      `preferred_method = "api_key"`,
    );
  } else if (/\[auth\]/.test(next)) {
    next = next.replace(/\[auth\]/, `[auth]\npreferred_method = "api_key"`);
  } else {
    next = `${next.trimEnd()}

[auth]
preferred_method = "api_key"
`;
  }

  writeFileSync(configPath, next.endsWith("\n") ? next : `${next}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return { configPath };
}

/**
 * Read-only heuristic: config.toml already has a BYOK key path
 * (`api_key = …` plus preferably preferred_method = api_key).
 * Does not invent OAuth.
 */
export function hasByokKeyPathInConfig(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const configPath = resolveAgentConfigTomlPath(env);
  if (!existsSync(configPath)) return false;
  let text = "";
  try {
    text = readFileSync(configPath, "utf8");
  } catch {
    return false;
  }
  const hasApiKey = /^\s*api_key\s*=\s*["'][^"']+["']/m.test(text);
  const prefersApiKey = /preferred_method\s*=\s*["']api_key["']/i.test(text);
  return hasApiKey && prefersApiKey;
}

export function parseInitializeAuthSnapshot(result: unknown): InitializeAuthSnapshot {
  const root =
    result && typeof result === "object" && !Array.isArray(result)
      ? (result as Record<string, unknown>)
      : {};
  const methodsRaw = Array.isArray(root.authMethods) ? root.authMethods : [];
  const authMethods: AcpAuthMethod[] = [];
  for (const item of methodsRaw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.id !== "string" || !rec.id) continue;
    authMethods.push({
      id: rec.id,
      name: typeof rec.name === "string" ? rec.name : undefined,
      description: typeof rec.description === "string" ? rec.description : undefined,
    });
  }
  const meta =
    root._meta && typeof root._meta === "object" && !Array.isArray(root._meta)
      ? (root._meta as Record<string, unknown>)
      : {};
  const defaultAuthMethodId =
    typeof meta.defaultAuthMethodId === "string" ? meta.defaultAuthMethodId : null;
  return { authMethods, defaultAuthMethodId };
}

export function advertisesXaiApiKey(snapshot: InitializeAuthSnapshot | null): boolean {
  if (!snapshot) return false;
  return snapshot.authMethods.some((m) => m.id === ACP_AUTH_METHOD_XAI_API_KEY);
}

export function shouldSkipAuthenticate(snapshot: InitializeAuthSnapshot | null): boolean {
  return snapshot?.defaultAuthMethodId === ACP_AUTH_METHOD_XAI_API_KEY;
}

function stringifyRpcData(data: unknown): string {
  if (data === undefined || data === null) return "";
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

export interface AuthFailureParts {
  message: string;
  data?: unknown;
  code?: number;
  httpish?: number;
}

/** Detect auth-shaped failures from thrown errors or raw RPC payloads. */
export function extractAuthFailureParts(input: unknown): AuthFailureParts | null {
  if (input == null) return null;

  if (input instanceof JsonRpcStdioError) {
    const rpc = input.rpcError;
    const message = rpc?.message ?? input.message;
    const data = rpc?.data;
    if (isAuthShapedMessage(message, data, rpc?.code)) {
      return { message, data, code: rpc?.code };
    }
    return null;
  }

  if (input instanceof Error) {
    const anyErr = input as Error & {
      rpcError?: { message?: string; data?: unknown; code?: number };
      code?: number | string;
      status?: number;
      statusCode?: number;
    };
    const rpc = anyErr.rpcError;
    const message = rpc?.message ?? anyErr.message;
    const data = rpc?.data;
    const httpish =
      typeof anyErr.status === "number"
        ? anyErr.status
        : typeof anyErr.statusCode === "number"
          ? anyErr.statusCode
          : typeof anyErr.code === "number"
            ? anyErr.code
            : undefined;
    if (isAuthShapedMessage(message, data, rpc?.code ?? httpish)) {
      return { message, data, code: rpc?.code, httpish };
    }
    return null;
  }

  if (typeof input === "object") {
    const rec = input as Record<string, unknown>;
    // JSON-RPC error object
    if (typeof rec.message === "string") {
      const data = rec.data;
      const code = typeof rec.code === "number" ? rec.code : undefined;
      if (isAuthShapedMessage(rec.message, data, code)) {
        return { message: rec.message, data, code };
      }
    }
    const nested =
      rec.error && typeof rec.error === "object"
        ? (rec.error as Record<string, unknown>)
        : null;
    if (nested && typeof nested.message === "string") {
      const data = nested.data;
      const code = typeof nested.code === "number" ? nested.code : undefined;
      if (isAuthShapedMessage(nested.message, data, code)) {
        return { message: nested.message, data, code };
      }
    }
  }

  if (typeof input === "string" && isAuthShapedMessage(input, undefined, undefined)) {
    return { message: input };
  }

  return null;
}

function isAuthShapedMessage(
  message: string,
  data: unknown,
  code: number | undefined,
): boolean {
  const msg = message.toLowerCase();
  const dataStr = stringifyRpcData(data).toLowerCase();
  if (msg.includes("authentication required")) return true;
  if (msg.includes("unauthorized") || msg.includes("unauthenticated")) return true;
  if (dataStr.includes("no auth method id provided")) return true;
  if (dataStr.includes("auth method")) return true;
  if (code === 401 || msg.includes("401") || dataStr.includes("401")) return true;
  if (msg.includes("missing") && msg.includes("api") && msg.includes("key")) return true;
  return false;
}

/**
 * Project auth-shaped payload → SessionPort UI `error` event.
 * Returns null when input is not auth-shaped (caller should not swallow other errors).
 */
export function projectAuthFailureToSessionUiEvent(
  input: unknown,
  env: NodeJS.ProcessEnv = process.env,
): Extract<SessionUiEvent, { type: "error" }> | null {
  const parts = extractAuthFailureParts(input);
  if (!parts) return null;

  const guidance = buildByokConfigGuidance(env);
  const dataNote = parts.data !== undefined ? ` ACP data: ${stringifyRpcData(parts.data)}.` : "";
  const rawNote = parts.message ? ` Agent said: ${parts.message}.` : "";

  return {
    type: "error",
    message: `${guidance.message}${rawNote}${dataNote}`,
    retriable: true,
  };
}

/**
 * Host authenticate entry result when BYOK is missing or only grok.com is advertised.
 * Never pretends OAuth works; never calls ACP authenticate for grok.com.
 */
export function buildAuthenticateGuidanceResult(
  snapshot: InitializeAuthSnapshot | null,
  env: NodeJS.ProcessEnv = process.env,
): AuthenticateResult {
  const guidance = buildByokConfigGuidance(env);
  const hasXai = advertisesXaiApiKey(snapshot);
  const onlyGrokCom =
    snapshot != null &&
    snapshot.authMethods.length > 0 &&
    snapshot.authMethods.every((m) => m.id === ACP_AUTH_METHOD_GROK_COM);

  if (!hasXai) {
    const reason = onlyGrokCom
      ? "Agent advertised only grok.com (ignored by ZeroWork Host)."
      : "Agent did not advertise xai.api_key.";
    return {
      ok: false,
      code: AUTH_CREDENTIALS_MISSING_CODE,
      message: `${guidance.message} ${reason}`,
      calledAcpAuthenticate: false,
      configPath: guidance.configPath,
      byokTemplate: guidance.byokTemplate,
    };
  }

  // Locked: if initialize already defaulted to xai.api_key, do not require authenticate.
  if (shouldSkipAuthenticate(snapshot)) {
    return {
      ok: true,
      code: "AUTH_SKIPPED_DEFAULT",
      message:
        "initialize _meta.defaultAuthMethodId is already xai.api_key; ACP authenticate not required.",
      methodId: ACP_AUTH_METHOD_XAI_API_KEY,
      calledAcpAuthenticate: false,
      configPath: guidance.configPath,
      byokTemplate: guidance.byokTemplate,
    };
  }

  if (!hasByokKeyPathInConfig(env)) {
    return {
      ok: false,
      code: "AUTH_BYOK_GUIDANCE",
      message: `${guidance.message} xai.api_key is advertised, but no BYOK api_key was found in config.toml.`,
      methodId: ACP_AUTH_METHOD_XAI_API_KEY,
      calledAcpAuthenticate: false,
      configPath: guidance.configPath,
      byokTemplate: guidance.byokTemplate,
    };
  }

  // Caller may still invoke ACP authenticate; this helper reports readiness.
  return {
    ok: true,
    code: "AUTH_APPLIED",
    message: "BYOK key path present; Host may call ACP authenticate with methodId xai.api_key.",
    methodId: ACP_AUTH_METHOD_XAI_API_KEY,
    calledAcpAuthenticate: false,
    configPath: guidance.configPath,
    byokTemplate: guidance.byokTemplate,
  };
}

export class AuthCredentialsMissingError extends Error {
  readonly code = AUTH_CREDENTIALS_MISSING_CODE;
  readonly retriable = true;
  readonly sessionUiEvent: Extract<SessionUiEvent, { type: "error" }>;

  constructor(event: Extract<SessionUiEvent, { type: "error" }>) {
    super(event.message);
    this.name = "AuthCredentialsMissingError";
    this.sessionUiEvent = event;
  }
}

/** Wrap any auth-shaped failure into AuthCredentialsMissingError (idempotent). */
export function toAuthCredentialsMissingError(
  input: unknown,
  env: NodeJS.ProcessEnv = process.env,
): AuthCredentialsMissingError | null {
  if (input instanceof AuthCredentialsMissingError) return input;
  const event = projectAuthFailureToSessionUiEvent(input, env);
  if (!event) return null;
  return new AuthCredentialsMissingError(event);
}
