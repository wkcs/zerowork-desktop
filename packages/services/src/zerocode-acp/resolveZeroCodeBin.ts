/**
 * Resolve the ZeroCode agent binary.
 *
 * Priority (frozen — ZeroWork 打包方案草案 / ACP 适配接口草案):
 *   1. process.env.ZEROCODE_BIN (if set and path exists)
 *   2. Bundled: <resourcesRoot>/agent/zerocode[.exe]
 *      resourcesRoot = options.resourcesRoot ?? process.resourcesPath
 *   3. `zerocode` on PATH
 *
 * Never silent-falls back to zcode-cli / glm / ZCODE_AGENT_RUNTIME.
 */

import { accessSync, constants, existsSync } from "node:fs";
import { delimiter, isAbsolute, join, resolve } from "node:path";

export const ZEROCODE_BIN_ENV = "ZEROCODE_BIN";
export const ZEROCODE_BIN_BASENAME = "zerocode";
export const ZEROCODE_BUNDLED_RELATIVE = join("agent", "zerocode");

export class ZeroCodeBinNotFoundError extends Error {
  readonly code = "ZEROCODE_BIN_NOT_FOUND" as const;

  constructor(message: string) {
    super(message);
    this.name = "ZeroCodeBinNotFoundError";
  }
}

export interface ResolveZeroCodeBinOptions {
  /**
   * Override Electron `process.resourcesPath` (and packaged root).
   * Useful in unit tests and non-Electron Host runners.
   */
  resourcesRoot?: string | null;
  /** Override env lookup; defaults to process.env.ZEROCODE_BIN. */
  envBin?: string | null;
  /** Override PATH search string; defaults to process.env.PATH. */
  pathEnv?: string | null;
  /** Override process.platform (tests). */
  platform?: NodeJS.Platform;
  /**
   * Custom existence / executability probe.
   * Default: file exists; on non-Windows also checks X_OK when possible.
   */
  isUsableFile?: (absolutePath: string) => boolean;
}

export interface ResolveZeroCodeBinResult {
  path: string;
  /** Which priority tier produced the hit. */
  source: "env" | "bundled" | "path";
}

function defaultIsUsableFile(absolutePath: string, platform: NodeJS.Platform): boolean {
  if (!existsSync(absolutePath)) {
    return false;
  }
  if (platform === "win32") {
    return true;
  }
  try {
    accessSync(absolutePath, constants.X_OK);
    return true;
  } catch {
    // Exists but not executable — still accept (some CI fixtures are mode 644).
    // Callers that need strict X_OK can inject isUsableFile.
    return existsSync(absolutePath);
  }
}

function binaryFileName(platform: NodeJS.Platform): string {
  return platform === "win32" ? `${ZEROCODE_BIN_BASENAME}.exe` : ZEROCODE_BIN_BASENAME;
}

function resolveBundledPath(
  resourcesRoot: string | null | undefined,
  platform: NodeJS.Platform,
): string | null {
  if (!resourcesRoot) {
    return null;
  }
  return join(resolve(resourcesRoot), "agent", binaryFileName(platform));
}

function searchPathEnv(
  pathEnv: string | null | undefined,
  platform: NodeJS.Platform,
  isUsable: (p: string) => boolean,
): string | null {
  if (!pathEnv) {
    return null;
  }
  const name = binaryFileName(platform);
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, name);
    if (isUsable(candidate)) {
      return candidate;
    }
  }
  return null;
}

function readElectronResourcesPath(): string | null {
  const value = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Resolve ZeroCode agent binary path or throw {@link ZeroCodeBinNotFoundError}.
 */
export function resolveZeroCodeBin(
  options: ResolveZeroCodeBinOptions = {},
): ResolveZeroCodeBinResult {
  const platform = options.platform ?? process.platform;
  const isUsable =
    options.isUsableFile ?? ((p: string) => defaultIsUsableFile(p, platform));

  const envRaw =
    options.envBin !== undefined ? options.envBin : process.env[ZEROCODE_BIN_ENV];
  if (typeof envRaw === "string" && envRaw.trim().length > 0) {
    const envPath = isAbsolute(envRaw) ? envRaw : resolve(envRaw);
    if (isUsable(envPath)) {
      return { path: envPath, source: "env" };
    }
  }

  const resourcesRoot =
    options.resourcesRoot !== undefined
      ? options.resourcesRoot
      : readElectronResourcesPath();
  const bundled = resolveBundledPath(resourcesRoot, platform);
  if (bundled && isUsable(bundled)) {
    return { path: bundled, source: "bundled" };
  }

  const pathEnv =
    options.pathEnv !== undefined ? options.pathEnv : (process.env.PATH ?? null);
  const fromPath = searchPathEnv(pathEnv, platform, isUsable);
  if (fromPath) {
    return { path: fromPath, source: "path" };
  }

  throw new ZeroCodeBinNotFoundError(
    [
      "ZeroCode agent binary not found.",
      `Checked: $${ZEROCODE_BIN_ENV}, bundled resources/agent/${binaryFileName(platform)}, PATH.`,
      "Set Agent path in settings, or wait for Backend MVP-1 card 1 to ship the zerocode binary.",
      "Do not fall back to zcode-cli / glm.",
    ].join(" "),
  );
}

/** Convenience: absolute path only. */
export function resolveZeroCodeBinPath(options?: ResolveZeroCodeBinOptions): string {
  return resolveZeroCodeBin(options).path;
}
