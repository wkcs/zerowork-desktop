import type { AppSettings } from "@zcode/shared";

/**
 * MVP-7: Welcome no longer collects a ZeroCode API key.
 * Skip/continue still marks provider-family migration done.
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
