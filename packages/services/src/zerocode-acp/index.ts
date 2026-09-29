/**
 * ZeroCode ACP Host adapter (SessionPort).
 *
 * MVP-1 card 2: skeleton only — not wired into default Host runtime.
 * See ./README.md for seam notes vs zcodeAgentProcessManager.
 */

export type {
  AgentStatus,
  ConfigOption,
  ConfigOptionId,
  McpServerConfig,
  OpenSessionInput,
  PermissionMode,
  PromptAttachment,
  PromptInput,
  PromptResult,
  SessionHandle,
  SessionPort,
  SessionUiEvent,
} from "./types.js";

export {
  resolveZeroCodeBin,
  resolveZeroCodeBinPath,
  ZeroCodeBinNotFoundError,
  ZEROCODE_BIN_ENV,
  ZEROCODE_BIN_BASENAME,
  ZEROCODE_BUNDLED_RELATIVE,
  type ResolveZeroCodeBinOptions,
  type ResolveZeroCodeBinResult,
} from "./resolveZeroCodeBin.js";

export {
  buildZeroCodeAgentSpawnSpec,
  buildSessionNewMeta,
  type BuildZeroCodeAgentSpawnSpecInput,
  type ZeroCodeAgentSpawnSpec,
} from "./spawnSpec.js";

export {
  JsonRpcStdioTransport,
  JsonRpcStdioError,
  type JsonRpcStdioTransportOptions,
} from "./jsonRpcStdio.js";

export {
  ZeroCodeAcpAdapter,
  type ZeroCodeAcpAdapterOptions,
} from "./ZeroCodeAcpAdapter.js";
