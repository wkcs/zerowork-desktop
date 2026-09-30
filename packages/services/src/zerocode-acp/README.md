# ZeroCode ACP adapter (Host SessionPort)

MVP-1 **card 2** skeleton: Host ↔ `zerocode agent … stdio` (ACP JSON-RPC).

## What this is

- `SessionPort` types aligned with `ZeroCode-ACP适配接口草案.md` §5
- `resolveZeroCodeBin`: `ZEROCODE_BIN` → `resources/agent/zerocode[.exe]` → `PATH`
- `buildZeroCodeAgentSpawnSpec`: `agent [--model] [--always-approve?] stdio`
- `ZeroCodeAcpAdapter`: lifecycle state machine + stdio JSON-RPC skeleton

## Default Host runtime (MVP-2 card A)

- **Default** new-session / chat path: Host `IZeroCodeSessionPortService` → `ZeroCodeAcpAdapter` (this package).
- Selection lives in `packages/services/src/zerocode-session-port/defaultAgentRuntime.ts`.
- Opt-out: `ZEROWORK_MVP1_SESSION_PORT=0` or `ZEROWORK_DEFAULT_AGENT_RUNTIME=zcode-cli`.
- Binary resolve stays `ZEROCODE_BIN` → bundled `resources/agent/zerocode` → `PATH` (**never** silent zcode-cli / glm fallback).
- `--always-approve` stays **OFF** unless `permissionMode === "yolo"` (Host facade defaults to ask/auto only).

## What this is intentionally NOT

- **Not** a claim that the dialogue loop / paid model stream works end-to-end without BYOK
- **Not** deleting legacy `ZCODE_AGENT_RUNTIME` / `zcodeAgentProcessManager` (V4 escape / plugins may still use it)
- **Not** letting Renderer speak raw ACP (always go through SessionPort Host facade)

## Seam vs legacy zcode-cli

| Old seam | Path | Replacement (default) |
|----------|------|-------------|
| Spawn args | `packages/shared/src/zcode-agent-runtime.ts` → `spawnArgs: ["app-server","--stdio"]` | `buildZeroCodeAgentSpawnSpec` → `["agent", …, "stdio"]` |
| Binary resolve | `findZCodeAgentRuntimeBinary` / `GLM_BINARY_PATH` / `resources/glm` | `resolveZeroCodeBin` / `ZEROCODE_BIN` / `resources/agent/zerocode` |
| Process manager | `zcodeAgentProcessManager.ts` + `ZCodeStdioTransport` (zcode-protocol) | `ZeroCodeAcpAdapter` + `JsonRpcStdioTransport` (ACP) |
| V4 harness sketch | `/workspace/harness-protocol/adapters/grok-build/` | This package is **ACP SessionPort**, not V4 |

## Permission flags

- **Default**: no `--always-approve` on the process.
- **`permissionMode === "yolo"`**: process may get `--always-approve`; `session/new` also gets `_meta.yoloMode`.
- **`ask` / `auto`**: no CLI flag; `auto` → `_meta.autoMode` only.


## Packaging (MVP-2 card D)

Bundled layout: `resources/agent/zerocode[.exe]` via electron-builder **extraResources** (when the file or `ZEROCODE_BIN` exists at pack time). Binary is **not** committed.

| Step | Command / note |
|------|----------------|
| Stage | `pnpm --filter @zcode/desktop prepare:zerocode-agent` (or set `ZEROCODE_BIN` then `prepare:runtime-assets`) |
| Drop manually | copy into `packages/desktop/resources/agent/` |
| Pack | `pnpm bundle:desktop -- --os … --arch …` |
| Resolve | `ZEROCODE_BIN` → bundled `resources/agent/zerocode` → `PATH` (**never** zcode-cli) |
| Flags | default **no** `--always-approve` |

Details (Chinese): `packages/desktop/resources/agent/README.md`.

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

## session/update projection (card 3)

Real ACP `session/update` params nest the payload:

```json
{ "sessionId": "…", "update": { "sessionUpdate": "agent_message_chunk", "content": { "type": "text", "text": "…" } } }
```

Host projection lives in `projectSessionUpdate.ts` (`agent_message_chunk` → `assistant_text_delta`). Flat legacy params are tolerated. Enable `debugSessionUpdates` on the adapter to log raw notification params while diagnosing.

## MVP-2 card B — auth / BYOK

- Auth failures on `session/new` project to SessionUiEvent `{ type: "error", message, retriable }`.
- Stable code in `message`: `AUTH_CREDENTIALS_MISSING` (UI may match; no new event required).
- Host `authenticate()` explains BYOK via `~/.zerowork/config.toml`; never grok.com browser OAuth.
- Optional ACP `authenticate` `{ methodId: "xai.api_key" }` only when BYOK path exists.
- See `/workspace/zerocode/MVP-2-卡B-Host进展.md`.

