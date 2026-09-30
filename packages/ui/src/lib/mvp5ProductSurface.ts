/**
 * MVP-5 卡2：隐藏 Z.AI / BigModel / Coding Plan 产品入口（用户可见面）。
 * 模块可暂留；冷启动欢迎页 / 侧栏 / 设置抽样不应再露出这些入口。
 */
export const MVP5_HIDE_ZAI_PRODUCT_ENTRIES = true;

/** Block z.ai / bigmodel.cn product purchase or API-key console URLs (card 3). */
export function isMvp5BlockedProductPurchaseUrl(url: string | null | undefined): boolean {
  if (!MVP5_HIDE_ZAI_PRODUCT_ENTRIES) return false;
  const value = url?.trim().toLowerCase() ?? "";
  if (!value) return false;
  return (
    value.includes("z.ai/") ||
    value.includes("://z.ai") ||
    value.includes("bigmodel.cn") ||
    value.includes("bigmodel.com")
  );
}
