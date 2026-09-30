/**
 * MVP-2 card A: Host default agent runtime selection.
 *
 * Default chat / new-session path uses ZeroCode ACP
 * (`ZeroCodeAcpAdapter` behind `IZeroCodeSessionPortService`).
 * Legacy zcode-cli (`ZCODE_AGENT_RUNTIME` / `zcodeAgentProcessManager`) stays
 * in-tree for V4 escape / plugins, but is NOT the default and must never be a
 * silent fallback when resolving the ZeroCode binary
 * (`ZEROCODE_BIN` → bundled `resources/agent/zerocode` → PATH).
 *
 * Opt-out (legacy default):
 *   - `ZEROWORK_MVP1_SESSION_PORT=0`
 *   - `ZEROWORK_DEFAULT_AGENT_RUNTIME=zcode-cli` | `zcode-agent` | `glm`
 *
 * Permission: SessionPort keeps `--always-approve` OFF by default
 * (`permissionMode` ask/auto only in the Host facade).
 */

export type HostDefaultAgentRuntimeKind = "zerocode-acp" | "zcode-cli";

export const ZEROWORK_DEFAULT_AGENT_RUNTIME_ENV = "ZEROWORK_DEFAULT_AGENT_RUNTIME";
export const ZEROWORK_MVP1_SESSION_PORT_ENV = "ZEROWORK_MVP1_SESSION_PORT";

export type HostDefaultAgentRuntimeEnv = NodeJS.ProcessEnv | Record<string, string | undefined>;

/**
 * Resolve which agent runtime Host treats as default for new sessions.
 * Unset / empty / unknown → `zerocode-acp` (product default).
 */
export function resolveHostDefaultAgentRuntime(
  env: HostDefaultAgentRuntimeEnv = process.env,
): HostDefaultAgentRuntimeKind {
  if (env[ZEROWORK_MVP1_SESSION_PORT_ENV] === "0") {
    return "zcode-cli";
  }

  const raw = env[ZEROWORK_DEFAULT_AGENT_RUNTIME_ENV]?.trim().toLowerCase();
  if (raw === "zcode-cli" || raw === "zcode-agent" || raw === "glm") {
    return "zcode-cli";
  }

  return "zerocode-acp";
}

/** True when new sessions should go through ZeroCodeAcpAdapter / SessionPort. */
export function isZeroCodeAcpDefaultAgentRuntime(
  env: HostDefaultAgentRuntimeEnv = process.env,
): boolean {
  return resolveHostDefaultAgentRuntime(env) === "zerocode-acp";
}

/**
 * Whether Host should register `IZeroCodeSessionPortService`.
 * Default ON; only off when the SessionPort default path is opted out.
 */
export function shouldRegisterZeroCodeSessionPortService(
  env: HostDefaultAgentRuntimeEnv = process.env,
): boolean {
  return isZeroCodeAcpDefaultAgentRuntime(env);
}
