#!/usr/bin/env node

import process from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNativeSearchReleasePlan } from "../../../scripts/native-search-tools-config.mjs";
import { runCommand } from "../../../scripts/spawn-command.mjs";
import { getTargetPlatform } from "./target-platform.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "..");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const target = getTargetPlatform();
const nativeSearchReleasePlan = resolveNativeSearchReleasePlan({
  platform: target.os,
  arch: target.arch,
});
// Windows Chrome 导入入口未启用，默认构建继续编译 helper 会增加 CI 时间和发布签名面。
// 保留显式开关，后续恢复入口时仍可复用既有原生实现和供应链校验。
const shouldPrepareWindowsBrowserImportHelper =
  target.os === "win32" && process.env.ZCODE_ENABLE_WINDOWS_BROWSER_IMPORT === "1";
// CUA 权限浮窗的吸附数据源。仅 macOS；缺 swiftc 时脚本内部自行降级为跳过（浮窗 fail-open
// 到屏幕底部，仍可用），所以无条件挂在 darwin 上不会让构建变脆。
const shouldPrepareMacosWindowBounds = target.os === "darwin";

// MVP-0 不随包内置上游 agent bundle；本地只准备桌面 shell 运行所需工具。
const localRuntimeScripts = [
  ...(nativeSearchReleasePlan.enabled ? ["prepare:native-search"] : []),
  ...(shouldPrepareWindowsBrowserImportHelper ? ["prepare:browser-import-helper"] : []),
  ...(shouldPrepareMacosWindowBounds ? ["prepare:macos-window-bounds"] : []),
];

function runTimedPnpmScript(scriptName) {
  const startMs = Date.now();
  console.log(`[ci][timer] prepare-runtime-assets:${scriptName} start`);
  try {
    runCommand(pnpmCommand, [scriptName], {
      cwd: desktopRoot,
      env: process.env,
    });
  } finally {
    console.log(
      `[ci][timer] prepare-runtime-assets:${scriptName} end duration_ms=${Date.now() - startMs}`,
    );
  }
}

// MVP-0 不打包远端运行时和上游 agent 资产，避免引入 apps/zcode-cli 产品 harness。
console.log("[prepare:runtime-assets] skip prepare:remote-assets for ZeroWork MVP-0");


// MVP-4 卡 1：开发态 soft-skip stage ZeroCode agent（ZEROCODE_BIN 或已放置的 resources/agent）。
// 缺 bin 不失败，便于无二进制 checkout 仍可 electron . / prepare。
// 打包 fail-closed 由 bundle.mjs 在 electron-builder 前调用 stage --require 负责。
console.log("[ci][timer] prepare-runtime-assets:stage-zerocode-agent start");
{
  const stageStart = Date.now();
  try {
    runCommand(process.execPath, [resolve(scriptDir, "stage-zerocode-agent.mjs")], {
      cwd: desktopRoot,
      env: process.env,
    });
  } finally {
    console.log(
      `[ci][timer] prepare-runtime-assets:stage-zerocode-agent end duration_ms=${Date.now() - stageStart}`,
    );
  }
}

for (const scriptName of localRuntimeScripts) {
  runTimedPnpmScript(scriptName);
}
