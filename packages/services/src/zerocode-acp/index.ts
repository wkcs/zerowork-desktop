/**
 * ZeroCode ACP Host adapter (SessionPort).
 *
 * MVP-2 card A: default Host chat runtime is ZeroCodeAcpAdapter via
 * `IZeroCodeSessionPortService` (see zerocode-session-port/defaultAgentRuntime.ts).
 * This package still does not speak to Renderer directly — UI uses the Host facade.
 * See ./README.md for seam notes vs legacy zcodeAgentProcessManager.
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

export {
  projectSessionUpdate,
  unwrapSessionUpdateParams,
  extractTextContent,
  type ProjectedSessionUpdate,
} from "./projectSessionUpdate.js";
