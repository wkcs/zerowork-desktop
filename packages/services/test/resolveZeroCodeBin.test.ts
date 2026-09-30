import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  resolveZeroCodeBin,
  ZeroCodeBinNotFoundError,
  ZEROCODE_INCOMPLETE_INSTALL_MESSAGE,
} from "../src/zerocode-acp/resolveZeroCodeBin.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "zerocode-bin-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function touchExecutable(path: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, "#!/bin/sh\necho stub\n", { mode: 0o755 });
  await chmod(path, 0o755);
}

test("resolveZeroCodeBin prefers ZEROCODE_BIN over bundled and PATH", async () => {
  await withTempDir(async (dir) => {
    const envBin = join(dir, "env", "zerocode");
    const bundled = join(dir, "resources", "agent", "zerocode");
    const pathBin = join(dir, "pathbin", "zerocode");
    await touchExecutable(envBin);
    await touchExecutable(bundled);
    await touchExecutable(pathBin);

    const result = resolveZeroCodeBin({
      envBin,
      resourcesRoot: join(dir, "resources"),
      pathEnv: join(dir, "pathbin"),
      platform: "linux",
    });
    assert.equal(result.source, "env");
    assert.equal(result.path, envBin);
  });
});

test("resolveZeroCodeBin uses bundled resources/agent when env missing", async () => {
  await withTempDir(async (dir) => {
    const bundled = join(dir, "resources", "agent", "zerocode");
    const pathBin = join(dir, "pathbin", "zerocode");
    await touchExecutable(bundled);
    await touchExecutable(pathBin);

    const result = resolveZeroCodeBin({
      envBin: null,
      resourcesRoot: join(dir, "resources"),
      pathEnv: join(dir, "pathbin"),
      platform: "linux",
    });
    assert.equal(result.source, "bundled");
    assert.equal(result.path, bundled);
  });
});

test("resolveZeroCodeBin falls back to PATH zerocode", async () => {
  await withTempDir(async (dir) => {
    const pathBin = join(dir, "pathbin", "zerocode");
    await touchExecutable(pathBin);

    const result = resolveZeroCodeBin({
      envBin: null,
      resourcesRoot: join(dir, "empty-resources"),
      pathEnv: join(dir, "pathbin"),
      platform: "linux",
    });
    assert.equal(result.source, "path");
    assert.equal(result.path, pathBin);
  });
});

test("resolveZeroCodeBin uses .exe on win32 bundled path", async () => {
  await withTempDir(async (dir) => {
    const bundled = join(dir, "resources", "agent", "zerocode.exe");
    await touchExecutable(bundled);

    const result = resolveZeroCodeBin({
      envBin: null,
      resourcesRoot: join(dir, "resources"),
      pathEnv: "",
      platform: "win32",
      isUsableFile: (p) => p === bundled,
    });
    assert.equal(result.source, "bundled");
    assert.equal(result.path, bundled);
  });
});

test("resolveZeroCodeBin ignores unusable ZEROCODE_BIN and continues", async () => {
  await withTempDir(async (dir) => {
    const missingEnv = join(dir, "missing", "zerocode");
    const pathBin = join(dir, "pathbin", "zerocode");
    await touchExecutable(pathBin);

    const result = resolveZeroCodeBin({
      envBin: missingEnv,
      resourcesRoot: null,
      pathEnv: join(dir, "pathbin"),
      platform: "linux",
    });
    assert.equal(result.source, "path");
    assert.equal(result.path, pathBin);
  });
});

test("resolveZeroCodeBin throws incomplete-install message without silent glm/zcode-cli fallback", async () => {
  await withTempDir(async (dir) => {
    assert.throws(
      () =>
        resolveZeroCodeBin({
          envBin: null,
          resourcesRoot: join(dir, "no-agent"),
          pathEnv: join(dir, "empty-path"),
          platform: "linux",
        }),
      (err: unknown) => {
        assert.ok(err instanceof ZeroCodeBinNotFoundError);
        assert.equal(err.message, ZEROCODE_INCOMPLETE_INSTALL_MESSAGE);
        assert.match(err.message, /安装包不完整/);
        assert.doesNotMatch(err.message, /zcode-cli|glm|Z\.AI|GLM_BINARY_PATH|zcode\.cjs|app-server/i);
        return true;
      },
    );
  });
});
