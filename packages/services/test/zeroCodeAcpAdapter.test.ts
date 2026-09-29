import assert from "node:assert/strict";
import test from "node:test";
import { ZeroCodeAcpAdapter } from "../src/zerocode-acp/ZeroCodeAcpAdapter.js";
import { ZeroCodeBinNotFoundError } from "../src/zerocode-acp/resolveZeroCodeBin.js";

test("ensureReady fails into Failed when binary missing (no fake success)", async () => {
  const adapter = new ZeroCodeAcpAdapter({
    resolveBinOptions: {
      envBin: null,
      resourcesRoot: "/nonexistent-zerocode-resources-mvp1",
      pathEnv: "",
      platform: "linux",
    },
    log: () => {},
  });

  assert.equal(adapter.getStatus(), "Idle");
  await assert.rejects(() => adapter.ensureReady(), ZeroCodeBinNotFoundError);
  assert.equal(adapter.getStatus(), "Failed");
  assert.match(adapter.getLastError() ?? "", /ZEROCODE_BIN|Agent path|card 1/i);
});

test("getStatus stays Idle before ensureReady", () => {
  const adapter = new ZeroCodeAcpAdapter({
    resolveBinOptions: { envBin: null, resourcesRoot: null, pathEnv: "" },
  });
  assert.equal(adapter.getStatus(), "Idle");
});
