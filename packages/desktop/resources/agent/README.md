# resources/agent — ZeroCode 随包二进制（MVP-2 卡 D）

## 解析顺序（运行时，Host / `resolveZeroCodeBin`）

1. **`ZEROCODE_BIN`**：环境变量指向可用文件时优先（绝对或相对路径）
2. **随包**：`process.resourcesPath/agent/zerocode`（Windows：`zerocode.exe`）
3. **`PATH`**：名为 `zerocode` / `zerocode.exe` 的可执行文件

**禁止**静默回退到 `zcode-cli` / `glm` / `ZCODE_AGENT_RUNTIME`。  
默认 spawn **不**带 `--always-approve`（仅 `permissionMode === "yolo"` 时才可加）。

## 打包前如何放入二进制

二进制 **不入 git**。出包机任选其一：

```bash
# 方式 A：环境变量（推荐 CI）
export ZEROCODE_BIN=/path/to/zerocode   # Win: zerocode.exe
pnpm --filter @zcode/desktop prepare:zerocode-agent
# 或随 prepare:runtime-assets / bundle 自动 stage

# 方式 B：直接拷到本目录
cp /path/to/zerocode packages/desktop/resources/agent/zerocode
chmod +x packages/desktop/resources/agent/zerocode
```

然后：

```bash
pnpm bundle:desktop -- --os linux --arch x64   # 按目标平台改
```

`electron-builder.config.js` 在配置加载时若发现本目录下的 `zerocode[.exe]`，
或可用的 `ZEROCODE_BIN`，会通过 **extraResources** 拷到安装包的 `resources/agent/`。
两者皆无时跳过（壳包仍可构建，运行时需自行提供 `ZEROCODE_BIN` 或 PATH）。

## 相关代码

| 位置 | 作用 |
|------|------|
| `packages/services/src/zerocode-acp/resolveZeroCodeBin.ts` | 运行时解析 |
| `packages/desktop/src/main/desktopRuntimeEnv.ts` | Host 注入 `ZEROCODE_BIN` |
| `packages/desktop/scripts/stage-zerocode-agent.mjs` | 打包前 stage |
| `packages/desktop/electron-builder.config.js` | `extraResources` 条件钩子 |
