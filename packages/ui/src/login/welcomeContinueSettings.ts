import type { AppSettings } from "@zcode/shared";

/**
 * MVP-8: Welcome continue-into-shell settings helper (no API key form).
 */

export function buildWelcomeContinueSettings(now: number): Pick<
  AppSettings,
  "providerFamilyDomainUpdatedAt" | "providerFamilyDomainMigrated"
> {
  // Skip no longer affirms a Z.AI / BigModel provider family; only mark migration done.
  return {
    providerFamilyDomainUpdatedAt: now,
    providerFamilyDomainMigrated: true,
  };
}
