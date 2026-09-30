/**
 * Spawn specification for `zerocode agent … stdio`.
 *
 * Permission policy (card 2 choice — documented):
 * - Product default: do NOT pass `--always-approve`.
 * - Only when `permissionMode === "yolo"` may we add `--always-approve` at process level.
 * - For ask/auto (and as the preferred long-term path), openSession maps modes to
 *   ACP `session/new` `_meta.yoloMode` / `_meta.autoMode` instead of a CLI flag.
 *   See OpenSessionInput → buildSessionNewMeta().
 */

import type { PermissionMode } from "./types.js";

export interface ZeroCodeAgentSpawnSpec {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
}

export interface BuildZeroCodeAgentSpawnSpecInput {
  /** Absolute workspace path (= ACP session/new.cwd). */
  cwd: string;
  /** Absolute path (or PATH name) of the zerocode binary. */
  bin: string;
  model?: string;
  permissionMode?: PermissionMode;
  /** Extra env merged on top of process.env by the adapter when spawning. */
  env?: Record<string, string>;
}

/**
 * Build argv for ZeroCode ACP agent.
 * Shape: `zerocode agent [--model <id>] [--always-approve] stdio`
 */
export function buildZeroCodeAgentSpawnSpec(
  input: BuildZeroCodeAgentSpawnSpecInput,
): ZeroCodeAgentSpawnSpec {
  const args: string[] = ["agent"];

  if (input.model && input.model.trim().length > 0) {
    args.push("--model", input.model.trim());
  }

  // ONLY yolo may add the process-level always-approve flag.
  // ask / auto stay on session `_meta` (see buildSessionNewMeta).
  if (input.permissionMode === "yolo") {
    args.push("--always-approve");
  }

  args.push("stdio");

  return {
    command: input.bin,
    args,
    cwd: input.cwd,
    env: input.env,
  };
}

/** Map permissionMode → session/new `_meta` fields (draft §3.2). */
export function buildSessionNewMeta(
  permissionMode?: PermissionMode,
): Record<string, unknown> | undefined {
  if (!permissionMode || permissionMode === "ask") {
    return undefined;
  }
  if (permissionMode === "yolo") {
    return { yoloMode: true };
  }
  if (permissionMode === "auto") {
    return { autoMode: true };
  }
  return undefined;
}
