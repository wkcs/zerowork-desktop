import type { OAuthProviderId } from "@zcode/shared";
import { LogInIcon } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { MVP5_HIDE_ZAI_PRODUCT_ENTRIES } from "@/lib/mvp5ProductSurface.js";
import bigModelIcon from "@/assets/provider-icons/logo-bigmodel.svg";
import zaiIcon from "@/assets/provider-icons/logo-zai.svg";
import { BIGMODEL_PROVIDER_ID, ZAI_PROVIDER_ID } from "@zcode/shared";

const OAUTH_PROVIDER_ICON_SRC: Partial<Record<OAuthProviderId, string>> = MVP5_HIDE_ZAI_PRODUCT_ENTRIES
  ? {}
  : {
      [BIGMODEL_PROVIDER_ID]: bigModelIcon,
      [ZAI_PROVIDER_ID]: zaiIcon,
    };

export function renderOAuthProviderIcon(provider: OAuthProviderId, className?: string) {
  const src = OAUTH_PROVIDER_ICON_SRC[provider];
  if (!src) {
    return <LogInIcon className={cn("shrink-0", className)} />;
  }

  return (
    <img src={src} alt="" aria-hidden="true" className={cn("shrink-0 object-contain", className)} />
  );
}
