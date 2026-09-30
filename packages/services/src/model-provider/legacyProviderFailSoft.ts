/**
 * MVP-10: ZeroWork 不再把 ZCode Built-in Release / Personal Provider Config
 * 当作产品配置路径。缺文件或 Built-in 均不可用时 fail-soft，避免启动 WARN/RPC FAIL 风暴。
 */

export function isBenignPersonalProviderConfigRecovery(error: unknown): boolean {
  for (const message of collectErrorMessages(error)) {
    if (
      message.includes("Bundled 与 Active ZCode Built-in Release 均不可用") ||
      message.includes("ENOENT") ||
      message.includes("no such file")
    ) {
      return true;
    }
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    if ((error as { code?: unknown }).code === "ENOENT") return true;
  }
  return false;
}

export function isLegacyProviderSurfaceSoftFailure(error: unknown): boolean {
  return collectErrorMessages(error).some(
    (message) =>
      message.includes("Bundled 与 Active ZCode Built-in Release 均不可用") ||
      (message.includes("ZCode Built-in") && message.includes("不可用")),
  );
}

export function collectErrorMessages(error: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<unknown>();
  const walk = (value: unknown): void => {
    if (value === null || value === undefined || seen.has(value)) return;
    seen.add(value);
    if (typeof value === "string") {
      out.push(value);
      return;
    }
    if (value instanceof Error) {
      out.push(value.message);
      walk((value as Error & { cause?: unknown }).cause);
      if (value instanceof AggregateError) {
        for (const inner of value.errors) walk(inner);
      }
      return;
    }
    if (typeof value === "object" && value !== null && "message" in value) {
      walk((value as { message?: unknown }).message);
    }
  };
  walk(error);
  return out;
}
