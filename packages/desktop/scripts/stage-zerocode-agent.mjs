#!/usr/bin/env node
/**
 * Stage ZeroCode agent binary into resources/agent/ before pack / for local resolve.
 *
 * Source priority:
 *   1. process.env.ZEROCODE_BIN (if the path exists)
 *   2. Already-present resources/agent/zerocode[.exe] (idempotent; not overwritten
 *      unless ZEROCODE_BIN is explicitly set)
 *
 * ELF is intentionally not committed; CI / pack machines inject via ZEROCODE_BIN.
 *
 * Soft vs hard failure (MVP-4 card 1):
 *   - Default (dev / prepare-runtime-assets / `electron .`): if neither source is
 *     usable, warn and exit 0 so a checkout without a binary can still open the shell.
 *   - Pack path (`--require` or ZCODE_REQUIRE_ZEROCODE_AGENT=1): exit non-zero when
 *     the binary cannot be staged. bundle.mjs and electron-builder.config.js use this
 *     fail-closed mode so dir/zip/installer packs never silently ship without agent.
 */

import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const agentDir = resolve(desktopRoot, "resources/agent");
const binaryName = process.platform === "win32" ? "zerocode.exe" : "zerocode";
const stagedPath = resolve(agentDir, binaryName);

const requireAgent =
  process.argv.includes("--require") || process.env.ZCODE_REQUIRE_ZEROCODE_AGENT === "1";

function isUsable(path) {
  return typeof path === "string" && path.trim().length > 0 && existsSync(path.trim());
}

mkdirSync(agentDir, { recursive: true });

const envBin = process.env.ZEROCODE_BIN?.trim() ?? "";
if (isUsable(envBin)) {
  const source = resolve(envBin);
  copyFileSync(source, stagedPath);
  if (process.platform !== "win32") {
    try {
      chmodSync(stagedPath, 0o755);
    } catch {
      // Non-fatal: some CI filesystems reject chmod.
    }
  }
  console.log(`[stage-zerocode-agent] staged from ZEROCODE_BIN → ${stagedPath}`);
  process.exit(0);
}

if (existsSync(stagedPath)) {
  console.log(`[stage-zerocode-agent] already present: ${stagedPath}`);
  process.exit(0);
}

const missingMessage = [
  "[stage-zerocode-agent] no ZEROCODE_BIN and no staged binary.",
  `Drop ${binaryName} into packages/desktop/resources/agent/ before pack,`,
  "or set ZEROCODE_BIN to an absolute path.",
].join(" ");

if (requireAgent) {
  console.error(
    `${missingMessage} Pack/bundle requires a staged ZeroCode agent (fail-closed).`,
  );
  process.exit(1);
}

console.warn(
  `${missingMessage} Dev/prepare soft-skip: shell can still open without a bundled agent.`,
);
process.exit(0);
