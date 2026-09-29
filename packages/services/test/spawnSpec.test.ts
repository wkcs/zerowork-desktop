import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSessionNewMeta,
  buildZeroCodeAgentSpawnSpec,
} from "../src/zerocode-acp/spawnSpec.js";

test("buildZeroCodeAgentSpawnSpec default has no --always-approve", () => {
  const spec = buildZeroCodeAgentSpawnSpec({
    cwd: "/workspace/demo",
    bin: "/opt/zerocode",
  });
  assert.equal(spec.command, "/opt/zerocode");
  assert.deepEqual(spec.args, ["agent", "stdio"]);
  assert.ok(!spec.args.includes("--always-approve"));
});

test("buildZeroCodeAgentSpawnSpec adds --model before stdio", () => {
  const spec = buildZeroCodeAgentSpawnSpec({
    cwd: "/ws",
    bin: "zerocode",
    model: "grok-code",
  });
  assert.deepEqual(spec.args, ["agent", "--model", "grok-code", "stdio"]);
});

test("buildZeroCodeAgentSpawnSpec adds --always-approve only for yolo", () => {
  const yolo = buildZeroCodeAgentSpawnSpec({
    cwd: "/ws",
    bin: "zerocode",
    permissionMode: "yolo",
  });
  assert.deepEqual(yolo.args, ["agent", "--always-approve", "stdio"]);

  const ask = buildZeroCodeAgentSpawnSpec({
    cwd: "/ws",
    bin: "zerocode",
    permissionMode: "ask",
  });
  assert.deepEqual(ask.args, ["agent", "stdio"]);

  const auto = buildZeroCodeAgentSpawnSpec({
    cwd: "/ws",
    bin: "zerocode",
    permissionMode: "auto",
  });
  assert.deepEqual(auto.args, ["agent", "stdio"]);
});

test("buildSessionNewMeta maps permission modes", () => {
  assert.equal(buildSessionNewMeta("ask"), undefined);
  assert.equal(buildSessionNewMeta(undefined), undefined);
  assert.deepEqual(buildSessionNewMeta("yolo"), { yoloMode: true });
  assert.deepEqual(buildSessionNewMeta("auto"), { autoMode: true });
});
