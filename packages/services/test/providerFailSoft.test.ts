import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createProviderRuntime } from "../src/model-provider/providerRuntime.js";
import {
  isBenignPersonalProviderConfigRecovery,
  isLegacyProviderSurfaceSoftFailure,
} from "../src/model-provider/legacyProviderFailSoft.js";
import { MVP6_STUB_ZAI_PRODUCT_SERVICES } from "../src/mvp6ProductSurface.js";

test("MVP-6 product stub flag remains on (ZeroWork fail-soft gate)", () => {
  assert.equal(MVP6_STUB_ZAI_PRODUCT_SERVICES, true);
});

test("isBenignPersonalProviderConfigRecovery treats missing builtin AggregateError as benign", () => {
  const err = new AggregateError([], "Bundled 与 Active ZCode Built-in Release 均不可用");
  assert.equal(isBenignPersonalProviderConfigRecovery(err), true);
  assert.equal(isBenignPersonalProviderConfigRecovery(Object.assign(new Error("boom"), { code: "ENOENT" })), true);
  assert.equal(isBenignPersonalProviderConfigRecovery(new Error("JSON parse failed at line 1")), false);
});

test("ProviderRuntime start + getView succeed with missing builtin release (empty views)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zw-provider-failsoft-"));
  try {
    await mkdir(join(dir, "config"), { recursive: true });
    const runtime = createProviderRuntime({
      zcodeBuiltinFilePath: join(dir, "missing-bundled.json"),
      zcodeBuiltinActiveFilePath: join(dir, "cache", "active.json"),
      personalFilePath: join(dir, "config", "personal.json"),
      personalPollingIntervalMs: false,
      watch: false,
    });
    await runtime.start();
    const settings = await runtime.providerSettings.getView();
    assert.equal(settings.providers.length, 0);
    assert.equal(settings.revision >= 0, true);
    const selection = await runtime.modelSelection.getView();
    assert.equal(selection.providers.length, 0);
    runtime.dispose();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("isLegacyProviderSurfaceSoftFailure covers remote client-config invalid response", () => {
  assert.equal(
    isLegacyProviderSurfaceSoftFailure(new Error("ZCode Built-in client-config: invalid response")),
    true,
  );
  assert.equal(isLegacyProviderSurfaceSoftFailure(new Error("disk full")), false);
});

test("provider-settings.refresh fail-soft catches rejecting facade.refresh", async () => {
  const { createProviderSettingsService } = await import(
    "../src/model-provider/providerFacadeServices.js"
  );
  const facade = {
    onDidChange: () => () => {},
    getView: () => ({ revision: 0, providerTemplates: [], providerOrder: [], providers: [] }),
    refresh: async () => {
      throw new Error("ZCode Built-in client-config: invalid response");
    },
  };
  const service = createProviderSettingsService(facade as never);
  const view = await service.refresh("unit-test");
  assert.deepEqual(view.providers, []);
  assert.equal(view.revision, 0);
});
