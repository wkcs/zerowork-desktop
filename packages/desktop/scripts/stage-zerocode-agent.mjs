#!/usr/bin/env node
/**
 * MVP-2 卡 D：打包前把 ZeroCode agent 二进制落到 resources/agent/。
 *
 * 来源优先级：
 *   1. process.env.ZEROCODE_BIN（若路径可用）
 *   2. 已存在的 resources/agent/zerocode[.exe]（幂等，不覆盖除非 ZEROCODE_BIN 显式给出）
 *
 * 故意不入库 ELF：二进制在打包机上按平台放入，或由 ZEROCODE_BIN 指向。
 * 缺失时只告警并 exit 0，不阻断壳包构建（骨架阶段允许无 agent）。
 */

import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const agentDir = resolve(desktopRoot, "resources/agent");
const binaryName = process.platform === "win32" ? "zerocode.exe" : "zerocode";
const stagedPath = resolve(agentDir, binaryName);

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
      // 非致命：部分 CI 文件系统不支持 chmod
    }
  }
  console.log(`[stage-zerocode-agent] staged from ZEROCODE_BIN → ${stagedPath}`);
  process.exit(0);
}

if (existsSync(stagedPath)) {
  console.log(`[stage-zerocode-agent] already present: ${stagedPath}`);
  process.exit(0);
}

console.warn(
  [
    "[stage-zerocode-agent] skip: no ZEROCODE_BIN and no staged binary.",
    `Drop ${binaryName} into packages/desktop/resources/agent/ before pack,`,
    "or set ZEROCODE_BIN to an absolute path. Pack continues without bundled agent.",
  ].join(" "),
);
process.exit(0);
