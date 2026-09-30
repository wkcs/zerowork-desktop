import {
  createDynamicWorkflowClientConfig,
  DEFAULT_DYNAMIC_WORKFLOW_MODE,
  DEFAULT_ZCODE_MODEL_CONTEXT_BUDGET_STRATEGY,
} from "@zcode/shared";
import type { ModelSelectionView } from "@zcode/provider";
import type { ICodingPlanSubscriptionService } from "./codingPlanSubscription.js";

const STUB_UNAVAILABLE = "Coding Plan product surface is stubbed (MVP-6).";

function rejectStub(): never {
  throw new Error(STUB_UNAVAILABLE);
}

const EMPTY_MODEL_SELECTION_VIEW: ModelSelectionView = {
  revision: 0,
  providers: [],
};

/**
 * Fail-closed Coding Plan service: configs stay empty/disabled; purchase APIs throw.
 * Keeps DI registration so callers do not crash on missing descriptor.
 */
export function createStubCodingPlanSubscriptionService(): ICodingPlanSubscriptionService {
  return {
    batchPreview: async () => ({
      productList: [],
      isSubscribed: false,
      isAuthenticated: null,
    }),
    getStaticProducts: async () => ({}),
    getStaticTeamProducts: async () => ({}),
    getStartPlanPreview: async () => null,
    getOffPeakClientConfig: async () => ({
      enabled: false,
      modelSelectionView: EMPTY_MODEL_SELECTION_VIEW,
    }),
    getDynamicWorkflowClientConfig: async () =>
      createDynamicWorkflowClientConfig(DEFAULT_DYNAMIC_WORKFLOW_MODE, "default"),
    getModelContextBudgetStrategy: async () => DEFAULT_ZCODE_MODEL_CONTEXT_BUDGET_STRATEGY,
    getForceUpdateConfig: async () => null,
    productInfo: async () => rejectStub(),
    preview: async () => rejectStub(),
    createSign: async () => rejectStub(),
    updateSign: async () => rejectStub(),
    checkPayment: async () => rejectStub(),
    checkPendingOrders: async () => ({ hasPendingOrders: false }),
    queryStripeCards: async () => [],
    bindStripeCard: async () => rejectStub(),
    unbindStripeCard: async () => rejectStub(),
    payStripe: async () => rejectStub(),
    checkPaypalSupport: async () => ({ isSupport: false }),
    createPaypalSetupToken: async () => rejectStub(),
    subscribePaypal: async () => rejectStub(),
    getEnterprisePricing: async () => ({ productList: [] }),
    getEnterpriseBalance: async () => rejectStub(),
    calculateEnterpriseOrder: async () => rejectStub(),
    createEnterpriseOrder: async () => rejectStub(),
    getEnterprisePendingOrders: async () => [],
    cancelEnterpriseOrder: async () => rejectStub(),
    continueEnterpriseOrderPayment: async () => rejectStub(),
    checkEnterpriseOrderStatus: async () => rejectStub(),
  };
}
