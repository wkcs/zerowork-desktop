import assert from "node:assert/strict";
import test from "node:test";
import {
  isZeroCodeAcpDefaultAgentRuntime,
  resolveHostDefaultAgentRuntime,
  shouldRegisterZeroCodeSessionPortService,
  ZEROWORK_DEFAULT_AGENT_RUNTIME_ENV,
  ZEROWORK_MVP1_SESSION_PORT_ENV,
} from "../src/zerocode-session-port/defaultAgentRuntime.js";

test("resolveHostDefaultAgentRuntime defaults to zerocode-acp", () => {
  assert.equal(resolveHostDefaultAgentRuntime({}), "zerocode-acp");
  assert.equal(resolveHostDefaultAgentRuntime({ [ZEROWORK_DEFAULT_AGENT_RUNTIME_ENV]: "" }), "zerocode-acp");
  assert.equal(
    resolveHostDefaultAgentRuntime({ [ZEROWORK_DEFAULT_AGENT_RUNTIME_ENV]: "zerocode-acp" }),
    "zerocode-acp",
  );
  assert.equal(
    resolveHostDefaultAgentRuntime({ [ZEROWORK_DEFAULT_AGENT_RUNTIME_ENV]: "acp" }),
    "zerocode-acp",
  );
  assert.ok(isZeroCodeAcpDefaultAgentRuntime({}));
  assert.ok(shouldRegisterZeroCodeSessionPortService({}));
});

test("ZEROWORK_MVP1_SESSION_PORT=0 opts out to legacy zcode-cli", () => {
  const env = { [ZEROWORK_MVP1_SESSION_PORT_ENV]: "0" };
  assert.equal(resolveHostDefaultAgentRuntime(env), "zcode-cli");
  assert.equal(isZeroCodeAcpDefaultAgentRuntime(env), false);
  assert.equal(shouldRegisterZeroCodeSessionPortService(env), false);
});

test("ZEROWORK_DEFAULT_AGENT_RUNTIME=zcode-cli opts out", () => {
  for (const value of ["zcode-cli", "zcode-agent", "glm", "ZCode-CLI"]) {
    const env = { [ZEROWORK_DEFAULT_AGENT_RUNTIME_ENV]: value };
    assert.equal(resolveHostDefaultAgentRuntime(env), "zcode-cli", value);
  }
});

test("MVP1 SessionPort=0 wins over DEFAULT_AGENT_RUNTIME=zerocode-acp", () => {
  const env = {
    [ZEROWORK_MVP1_SESSION_PORT_ENV]: "0",
    [ZEROWORK_DEFAULT_AGENT_RUNTIME_ENV]: "zerocode-acp",
  };
  assert.equal(resolveHostDefaultAgentRuntime(env), "zcode-cli");
});

test("default path never silently selects zcode-cli without explicit opt-out", () => {
  // Whitespace / unknown values stay on ACP — no silent legacy fallback.
  assert.equal(
    resolveHostDefaultAgentRuntime({ [ZEROWORK_DEFAULT_AGENT_RUNTIME_ENV]: "  " }),
    "zerocode-acp",
  );
  assert.equal(
    resolveHostDefaultAgentRuntime({ [ZEROWORK_DEFAULT_AGENT_RUNTIME_ENV]: "something-else" }),
    "zerocode-acp",
  );
  assert.equal(
    resolveHostDefaultAgentRuntime({ [ZEROWORK_MVP1_SESSION_PORT_ENV]: "1" }),
    "zerocode-acp",
  );
});
