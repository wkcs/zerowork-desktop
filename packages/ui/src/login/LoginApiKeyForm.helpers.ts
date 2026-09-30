import type { AppSettings } from "@zcode/shared";

/**
 * MVP-5 card 3: Welcome API Key form is a single ZeroCode BYOK field.
 * No zai | bigmodel product picker.
 */

export function buildLoginApiKeySkipSettings(now: number): Pick<
  AppSettings,
  "providerFamilyDomainUpdatedAt" | "providerFamilyDomainMigrated"
> {
  // Skip no longer affirms a Z.AI / BigModel provider family; only mark migration done.
  return {
    providerFamilyDomainUpdatedAt: now,
    providerFamilyDomainMigrated: true,
  };
}
