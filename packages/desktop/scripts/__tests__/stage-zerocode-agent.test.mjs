import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../stage-zerocode-agent.mjs",
);

function runStage({ cwd, env = {}, args = [] }) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    env: { ...process.env, ...env, ZEROCODE_BIN: env.ZEROCODE_BIN ?? "" },
    encoding: "utf8",
  });
}

test("soft-skip exits 0 when no bin and no staged file", () => {
  const root = mkdtempSync(join(tmpdir(), "stage-zc-soft-"));
  mkdirSync(join(root, "resources/agent"), { recursive: true });
  // Point script at temp tree by running from a fake desktop root is hard because
  // the script resolves its own desktopRoot via import.meta.url. Instead assert
  // the live script's soft mode with staged file moved aside when present.
  const agentDir = resolve(dirname(scriptPath), "../resources/agent");
  const staged = join(agentDir, "zerocode");
  const aside = join(agentDir, "zerocode.mvp4-test-aside");
  let moved = false;
  try {
    if (existsSync(staged)) {
      renameSync(staged, aside);
      moved = true;
    }
    const env = { ...process.env };
    delete env.ZEROCODE_BIN;
    const result = spawnSync(process.execPath, [scriptPath], {
      env,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stderr + result.stdout, /soft-skip|no ZEROCODE_BIN/);
  } finally {
    if (moved && existsSync(aside)) renameSync(aside, staged);
    rmSync(root, { recursive: true, force: true });
  }
});

test("--require exits non-zero when no bin and no staged file", () => {
  const agentDir = resolve(dirname(scriptPath), "../resources/agent");
  const staged = join(agentDir, "zerocode");
  const aside = join(agentDir, "zerocode.mvp4-test-aside");
  let moved = false;
  try {
    if (existsSync(staged)) {
      renameSync(staged, aside);
      moved = true;
    }
    const env = { ...process.env };
    delete env.ZEROCODE_BIN;
    const result = spawnSync(process.execPath, [scriptPath, "--require"], {
      env,
      encoding: "utf8",
    });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stderr + result.stdout, /fail-closed|required/i);
  } finally {
    if (moved && existsSync(aside)) renameSync(aside, staged);
  }
});
