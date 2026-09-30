import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createEmptyZCodeBuiltinRelease,
  createNodeZCodeBuiltinProviderConfigSource,
} from "../src/zcode-builtin-provider-config-source.js";
import { serializeZCodeBuiltinRelease } from "../src/zcode-builtin-release.js";

test("createEmptyZCodeBuiltinRelease is revision 0 with empty maps", () => {
  const release = createEmptyZCodeBuiltinRelease();
  assert.equal(release.revision, 0);
  assert.equal(release.schemaVersion, 1);
  assert.equal(release.config.providers.rules().length, 0);
  assert.equal(release.config.providerTemplates.keys().length, 0);
  assert.equal(release.config.modelConfigRules.rules().length, 0);
});

test("missing bundled and active releases fail-soft to empty snapshot (no AggregateError)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zw-builtin-missing-"));
  try {
    const bundled = join(dir, "missing-bundled.json");
    const active = join(dir, "cache", "active.json");
    const source = createNodeZCodeBuiltinProviderConfigSource({
      bundledFilePath: bundled,
      activeFilePath: active,
      watch: false,
    });
    const snapshot = await source.read();
    assert.match(snapshot.revision, /^zcode-builtin:0:/);
    assert.equal(snapshot.providers.rules().length, 0);
    assert.equal(snapshot.providerTemplates?.keys().length ?? 0, 0);
    source.dispose();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("corrupt bundled and active releases fail-soft to empty snapshot", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zw-builtin-corrupt-"));
  try {
    await mkdir(join(dir, "cache"), { recursive: true });
    const bundled = join(dir, "bundled.json");
    const active = join(dir, "cache", "active.json");
    await writeFile(bundled, "{not-json", "utf8");
    await writeFile(active, '{"schemaVersion":1,"revision":1,"config":{}}', "utf8");
    const source = createNodeZCodeBuiltinProviderConfigSource({
      bundledFilePath: bundled,
      activeFilePath: active,
      watch: false,
    });
    const snapshot = await source.read();
    assert.match(snapshot.revision, /^zcode-builtin:0:/);
    assert.equal(snapshot.providers.rules().length, 0);
    source.dispose();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("valid bundled is preferred over missing active", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zw-builtin-valid-"));
  try {
    const bundled = join(dir, "bundled.json");
    const active = join(dir, "cache", "active.json");
    const release = createEmptyZCodeBuiltinRelease();
    // Use a non-zero revision empty-shaped payload via encode path from serialize
    const payload = JSON.parse(serializeZCodeBuiltinRelease({ ...release, revision: 3 }));
    await writeFile(bundled, JSON.stringify(payload), "utf8");
    const source = createNodeZCodeBuiltinProviderConfigSource({
      bundledFilePath: bundled,
      activeFilePath: active,
      watch: false,
    });
    const snapshot = await source.read();
    assert.match(snapshot.revision, /^zcode-builtin:3:/);
    source.dispose();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
