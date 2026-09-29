# ZeroCode ACP adapter (Host SessionPort)

MVP-1 **card 2** skeleton: Host ↔ `zerocode agent … stdio` (ACP JSON-RPC).

## What this is

- `SessionPort` types aligned with `ZeroCode-ACP适配接口草案.md` §5
- `resolveZeroCodeBin`: `ZEROCODE_BIN` → `resources/agent/zerocode[.exe]` → `PATH`
- `buildZeroCodeAgentSpawnSpec`: `agent [--model] [--always-approve?] stdio`
- `ZeroCodeAcpAdapter`: lifecycle state machine + stdio JSON-RPC skeleton

## What this is intentionally NOT (yet)

- **Not** wired into UI hooks / Renderer (card 3)
- **Not** replacing `ZCODE_AGENT_RUNTIME.spawnArgs` (`["app-server","--stdio"]`)
- **Not** swapping `zcodeAgentProcessManager` default spawn
- **Not** a claim that the dialogue loop works end-to-end

## When to replace the old seam

| Old seam | Path | Replacement |
|----------|------|-------------|
| Spawn args | `packages/shared/src/zcode-agent-runtime.ts` → `spawnArgs: ["app-server","--stdio"]` | `buildZeroCodeAgentSpawnSpec` → `["agent", …, "stdio"]` |
| Binary resolve | `findZCodeAgentRuntimeBinary` / `GLM_BINARY_PATH` / `resources/glm` | `resolveZeroCodeBin` / `ZEROCODE_BIN` / `resources/agent/zerocode` |
| Process manager | `zcodeAgentProcessManager.ts` + `ZCodeStdioTransport` (zcode-protocol) | `ZeroCodeAcpAdapter` + `JsonRpcStdioTransport` (ACP) |
| V4 harness sketch | `/workspace/harness-protocol/adapters/grok-build/` | This package is **ACP SessionPort**, not V4 |

Recommended cutover (later cards): inject `ZeroCodeAcpAdapter` behind a Host facade / `IPlatformService` session API; keep old zcode-agent path until card 1 ships a runnable `zerocode` binary and card 3 wires UI.

## Permission flags

- **Default**: no `--always-approve` on the process.
- **`permissionMode === "yolo"`**: process may get `--always-approve`; `session/new` also gets `_meta.yoloMode`.
- **`ask` / `auto`**: no CLI flag; `auto` → `_meta.autoMode` only.

## Local checks

```bash
# unit: bin priority (no real agent)
node --import tsx --test packages/services/test/resolveZeroCodeBin.test.ts
node --import tsx --test packages/services/test/spawnSpec.test.ts

# missing binary must Fail (no fake stream)
node --import tsx -e "
  import { ZeroCodeAcpAdapter } from './packages/services/src/zerocode-acp/index.ts';
  const a = new ZeroCodeAcpAdapter({
    resolveBinOptions: { envBin: null, resourcesRoot: '/nope', pathEnv: '' },
  });
  a.ensureReady().then(
    () => { console.error('UNEXPECTED OK'); process.exit(1); },
    (e) => { console.log('expected fail:', a.getStatus(), e.message.slice(0,120)); }
  );
"
```
