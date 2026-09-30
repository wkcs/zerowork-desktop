import assert from "node:assert/strict";
import { test } from "node:test";
import { MVP6_STUB_ZAI_PRODUCT_SERVICES } from "../src/mvp6ProductSurface.js";
import { createCodingPlanSubscriptionService } from "../src/coding-plan-subscription/codingPlanSubscriptionService.js";
import { createOAuthRuntimeConfig } from "../src/oauth/runtimeConfig.js";
import { createOAuthProviderAdapters } from "../src/oauth/providers/index.js";

test("MVP-6 stub flag is on by default", () => {
  assert.equal(MVP6_STUB_ZAI_PRODUCT_SERVICES, true);
});

test("createCodingPlanSubscriptionService returns fail-closed stub", async () => {
  const service = createCodingPlanSubscriptionService({
    apiClient: {} as never,
    credentialService: { load: async () => null },
  });
  const offPeak = await service.getOffPeakClientConfig();
  assert.equal(offPeak.enabled, false);
  assert.deepEqual(offPeak.modelSelectionView.providers, []);
  const workflow = await service.getDynamicWorkflowClientConfig();
  assert.equal(workflow.enabled, false);
  assert.equal(workflow.mode, "disabled");
  await assert.rejects(() => service.preview({ productId: "x" }), /stubbed/);
});

test("OAuth runtime config has no Z.AI / BigModel providers when stubbed", () => {
  const config = createOAuthRuntimeConfig({});
  assert.deepEqual(config.providers, []);
  assert.deepEqual(createOAuthProviderAdapters(config, { apiClient: {} as never }), []);
});
