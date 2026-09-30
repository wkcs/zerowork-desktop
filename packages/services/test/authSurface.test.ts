import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JsonRpcStdioError } from "../src/zerocode-acp/jsonRpcStdio.js";
import {
  ACP_AUTH_METHOD_XAI_API_KEY,
  AUTH_CREDENTIALS_MISSING_CODE,
  AuthCredentialsMissingError,
  advertisesXaiApiKey,
  buildAuthenticateGuidanceResult,
  buildByokConfigGuidance,
  extractAuthFailureParts,
  hasByokKeyPathInConfig,
  writeByokApiKeyToConfig,
  parseInitializeAuthSnapshot,
  projectAuthFailureToSessionUiEvent,
  resolveAgentConfigTomlPath,
  resolveAgentDataDir,
  shouldSkipAuthenticate,
  toAuthCredentialsMissingError,
} from "../src/zerocode-acp/authSurface.js";

test("resolveAgentDataDir prefers GROK_HOME then ZEROWORK_DATA_BASE_DIR/.zerowork", () => {
  assert.equal(
    resolveAgentDataDir({ GROK_HOME: "/tmp/iso/.zerowork" }),
    "/tmp/iso/.zerowork",
  );
  assert.equal(
    resolveAgentDataDir({ ZEROWORK_DATA_BASE_DIR: "/tmp/base", HOME: "/ignored" }),
    join("/tmp/base", ".zerowork"),
  );
  assert.equal(
    resolveAgentConfigTomlPath({ GROK_HOME: "/tmp/iso/.zerowork" }),
    join("/tmp/iso/.zerowork", "config.toml"),
  );
});

test("parseInitializeAuthSnapshot reads authMethods + defaultAuthMethodId (no-creds grok.com only)", () => {
  const snap = parseInitializeAuthSnapshot({
    authMethods: [{ id: "grok.com", name: "Grok", description: "Sign in with Grok" }],
    _meta: { defaultAuthMethodId: null, agentVersion: "1.0.45" },
  });
  assert.deepEqual(
    snap.authMethods.map((m) => m.id),
    ["grok.com"],
  );
  assert.equal(snap.defaultAuthMethodId, null);
  assert.equal(advertisesXaiApiKey(snap), false);
});

test("parseInitializeAuthSnapshot BYOK advertises xai.api_key and may default", () => {
  const snap = parseInitializeAuthSnapshot({
    authMethods: [
      {
        id: "xai.api_key",
        name: "xai.api_key",
        description: "XAI_API_KEY or api_key/env_key in config.toml",
      },
    ],
    _meta: { defaultAuthMethodId: "xai.api_key" },
  });
  assert.equal(advertisesXaiApiKey(snap), true);
  assert.equal(shouldSkipAuthenticate(snap), true);
});

test("projectAuthFailure: session/new Authentication required + data → visible error event", () => {
  const rpcErr = new JsonRpcStdioError("Authentication required", {
    code: -32000,
    message: "Authentication required",
    data: "no auth method id provided",
  });
  const ev = projectAuthFailureToSessionUiEvent(rpcErr, {
    GROK_HOME: "/tmp/mvp2-auth-home/.zerowork",
  });
  assert.ok(ev, "must project auth failure (not swallow)");
  assert.equal(ev!.type, "error");
  assert.equal(ev!.retriable, true);
  assert.match(ev!.message, new RegExp(AUTH_CREDENTIALS_MISSING_CODE));
  assert.match(ev!.message, /config\.toml|~\.?\/?\.zerowork|api_key|BYOK|credentials/i);
  assert.match(ev!.message, /Authentication required/);
  assert.match(ev!.message, /no auth method id provided/);
  // Must not be a bare silent 401
  assert.notEqual(ev!.message.trim(), "401");
  assert.notEqual(ev!.message.trim(), "Unauthorized");
});

test("projectAuthFailure: raw 401-shaped payload is not swallowed", () => {
  const ev = projectAuthFailureToSessionUiEvent(
    { error: { code: 401, message: "Unauthorized", data: "401" } },
    { HOME: "/tmp/home-auth" },
  );
  assert.ok(ev);
  assert.equal(ev!.type, "error");
  assert.match(ev!.message, new RegExp(AUTH_CREDENTIALS_MISSING_CODE));
  assert.match(ev!.message, /\.zerowork/);
});

test("projectAuthFailure: non-auth errors return null (do not invent auth banner)", () => {
  assert.equal(projectAuthFailureToSessionUiEvent(new Error("ENOENT: missing bin")), null);
  assert.equal(
    projectAuthFailureToSessionUiEvent(
      new JsonRpcStdioError("session/new did not return sessionId", {
        code: -32603,
        message: "session/new did not return sessionId",
      }),
    ),
    null,
  );
});

test("toAuthCredentialsMissingError wraps projected event", () => {
  const err = toAuthCredentialsMissingError(
    new JsonRpcStdioError("Authentication required", {
      code: -32000,
      message: "Authentication required",
      data: "no auth method id provided",
    }),
    { GROK_HOME: "/workspace/mvp1-wire-home/.zerowork" },
  );
  assert.ok(err instanceof AuthCredentialsMissingError);
  assert.equal(err!.sessionUiEvent.type, "error");
  assert.equal(err!.message, err!.sessionUiEvent.message);
  assert.match(err!.message, /AUTH_CREDENTIALS_MISSING/);
});

test("hasByokKeyPathInConfig detects wire-local sample shape", () => {
  const root = mkdtempSync(join(tmpdir(), "zw-auth-byok-"));
  const dataDir = join(root, ".zerowork");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    join(dataDir, "config.toml"),
    `[model.wire-local]
name = "Wire Local"
base_url = "http://127.0.0.1:9/v1"
api_key = "wire-test-placeholder-not-for-inference"

[auth]
preferred_method = "api_key"
`,
    "utf8",
  );
  try {
    assert.equal(hasByokKeyPathInConfig({ GROK_HOME: dataDir }), true);
    assert.equal(hasByokKeyPathInConfig({ GROK_HOME: join(root, "missing") }), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("buildAuthenticateGuidanceResult: grok.com-only → credentials missing, no ACP call", () => {
  const result = buildAuthenticateGuidanceResult(
    {
      authMethods: [{ id: "grok.com", name: "Grok" }],
      defaultAuthMethodId: null,
    },
    { GROK_HOME: "/tmp/no-byok/.zerowork" },
  );
  assert.equal(result.ok, false);
  assert.equal(result.calledAcpAuthenticate, false);
  assert.equal(result.code, AUTH_CREDENTIALS_MISSING_CODE);
  assert.match(result.message, /grok\.com/i);
  assert.match(result.byokTemplate, /preferred_method\s*=\s*"api_key"/);
  assert.match(result.byokTemplate, /api_key\s*=/);
  assert.equal(result.methodId, undefined);
});

test("buildAuthenticateGuidanceResult: defaultAuthMethodId xai.api_key → skip authenticate", () => {
  const result = buildAuthenticateGuidanceResult(
    {
      authMethods: [{ id: ACP_AUTH_METHOD_XAI_API_KEY }],
      defaultAuthMethodId: ACP_AUTH_METHOD_XAI_API_KEY,
    },
    { GROK_HOME: "/tmp/whatever/.zerowork" },
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, "AUTH_SKIPPED_DEFAULT");
  assert.equal(result.calledAcpAuthenticate, false);
  assert.equal(result.methodId, ACP_AUTH_METHOD_XAI_API_KEY);
});

test("buildByokConfigGuidance mentions verified config.toml fields", () => {
  const g = buildByokConfigGuidance({ GROK_HOME: "/workspace/mvp1-wire-home/.zerowork" });
  assert.equal(g.configPath, "/workspace/mvp1-wire-home/.zerowork/config.toml");
  assert.match(g.message, /preferred_method/);
  assert.match(g.byokTemplate, /\[model\.wire-local\]/);
  assert.match(g.byokTemplate, /\[auth\]/);
});

test("extractAuthFailureParts reads JsonRpcStdioError.rpcError", () => {
  const parts = extractAuthFailureParts(
    new JsonRpcStdioError("Authentication required", {
      code: -32000,
      message: "Authentication required",
      data: "no auth method id provided",
    }),
  );
  assert.ok(parts);
  assert.equal(parts!.message, "Authentication required");
  assert.equal(parts!.data, "no auth method id provided");
});

test("AuthCredentialsMissingError.sessionUiEvent is the UI-consumable error contract", () => {
  const event = projectAuthFailureToSessionUiEvent(
    {
      error: {
        message: "Authentication required",
        data: "no auth method id provided",
        code: -32000,
      },
    },
    { GROK_HOME: "/workspace/mvp1-wire-home/.zerowork" },
  );
  assert.ok(event);
  const wrapped = new AuthCredentialsMissingError(event!);
  // Exact contract UI already renders (useSessionPortChat case "error"):
  assert.equal(wrapped.sessionUiEvent.type, "error");
  assert.equal(typeof wrapped.sessionUiEvent.message, "string");
  assert.equal(typeof wrapped.sessionUiEvent.retriable, "boolean");
  assert.match(wrapped.sessionUiEvent.message, /AUTH_CREDENTIALS_MISSING/);
  assert.match(wrapped.sessionUiEvent.message, /mvp1-wire-home\/\.zerowork\/config\.toml/);
});

test("writeByokApiKeyToConfig writes preferred_method + api_key Host can detect", () => {
  const root = mkdtempSync(join(tmpdir(), "zw-auth-write-byok-"));
  const dataDir = join(root, ".zerowork");
  try {
    const { configPath } = writeByokApiKeyToConfig("user-byok-key-for-test", {
      GROK_HOME: dataDir,
    });
    assert.equal(configPath, join(dataDir, "config.toml"));
    assert.equal(hasByokKeyPathInConfig({ GROK_HOME: dataDir }), true);
    const body = readFileSync(configPath, "utf8");
    assert.match(body, /preferred_method\s*=\s*"api_key"/);
    assert.match(body, /api_key\s*=\s*"user-byok-key-for-test"/);
    assert.match(body, /\[model\.zerocode\]/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writeByokApiKeyToConfig updates existing config without dropping marketplace", () => {
  const root = mkdtempSync(join(tmpdir(), "zw-auth-write-byok-merge-"));
  const dataDir = join(root, ".zerowork");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    join(dataDir, "config.toml"),
    `[model.wire-local]
name = "Wire Local"
base_url = "http://127.0.0.1:9/v1"
api_key = "old-key"

[auth]
preferred_method = "oauth"

[marketplace]
default_skills_installs_purged = true
`,
    "utf8",
  );
  try {
    writeByokApiKeyToConfig("new-key", { GROK_HOME: dataDir });
    const body = readFileSync(join(dataDir, "config.toml"), "utf8");
    assert.match(body, /api_key\s*=\s*"new-key"/);
    assert.match(body, /preferred_method\s*=\s*"api_key"/);
    assert.match(body, /\[marketplace\]/);
    assert.equal(hasByokKeyPathInConfig({ GROK_HOME: dataDir }), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writeByokApiKeyToConfig rejects empty key", () => {
  assert.throws(() => writeByokApiKeyToConfig("   ", { GROK_HOME: "/tmp/unused" }), /empty/i);
});
