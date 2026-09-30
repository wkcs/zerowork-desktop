/**
 * MVP-7: ZeroCode config.toml settings (via Host SessionPort read/write).
 * Does not use ZAI/BigModel ModelProvider or welcome-page saveByokApiKey.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2Icon, TriangleAlertIcon } from "lucide-react";
import type { IZeroCodeSessionPortService } from "@zcode/services";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useOptionalServices } from "@/hooks/useServices.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { logger } from "@/logger.js";
import { SettingsGroupCard, SettingsRow } from "@/settings/SettingsPageParts.js";

type ZeroCodeConfigSnapshot = Awaited<
  ReturnType<IZeroCodeSessionPortService["readZeroCodeConfig"]>
>;

function emptyForm() {
  return {
    id: "",
    name: "",
    baseUrl: "",
    model: "",
    apiKey: "",
    defaultModelId: "",
  };
}

export function ZeroCodeConfigSection() {
  const { intl } = useZCodeIntl();
  const services = useOptionalServices();
  const sessionPort = services?.zerocodeSessionPortService;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ZeroCodeConfigSnapshot | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [apiKeySet, setApiKeySet] = useState(false);
  const [apiKeyMasked, setApiKeyMasked] = useState<string | undefined>(undefined);

  const applySnapshot = useCallback((next: ZeroCodeConfigSnapshot) => {
    setSnapshot(next);
    const primary = next.models[0];
    setForm({
      id: primary?.id ?? "",
      name: primary?.name ?? "",
      baseUrl: primary?.baseUrl ?? "",
      model: primary?.model ?? "",
      apiKey: "",
      defaultModelId: next.defaultModelId ?? primary?.id ?? "",
    });
    setApiKeySet(Boolean(primary?.apiKeySet));
    setApiKeyMasked(primary?.apiKeyMasked);
  }, []);

  const reload = useCallback(async () => {
    if (!sessionPort) {
      setLoading(false);
      setError(intl.formatMessage({ id: "settings.zeroCodeConfig.unavailable" }));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await sessionPort.readZeroCodeConfig();
      applySnapshot(next);
    } catch (loadError) {
      logger.error("[ZeroCodeConfig] read failed", { error: loadError });
      setError(
        intl.formatMessage(
          { id: "settings.zeroCodeConfig.loadError" },
          {
            error: loadError instanceof Error ? loadError.message : String(loadError),
          },
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [applySnapshot, intl, sessionPort]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onSave = useCallback(async () => {
    if (!sessionPort) {
      setError(intl.formatMessage({ id: "settings.zeroCodeConfig.unavailable" }));
      return;
    }
    const id = form.id.trim();
    if (!id) {
      setError(intl.formatMessage({ id: "settings.zeroCodeConfig.idRequired" }));
      return;
    }
    if (!form.apiKey.trim() && !apiKeySet) {
      setError(intl.formatMessage({ id: "settings.zeroCodeConfig.apiKeyRequired" }));
      return;
    }

    setSaving(true);
    setError(null);
    setSavedHint(null);
    try {
      const writeModel: {
        id: string;
        name?: string;
        baseUrl?: string;
        model?: string;
        apiKey?: string;
      } = { id };
      if (form.name.trim()) writeModel.name = form.name.trim();
      if (form.baseUrl.trim()) writeModel.baseUrl = form.baseUrl.trim();
      if (form.model.trim()) writeModel.model = form.model.trim();
      if (form.apiKey.trim()) writeModel.apiKey = form.apiKey.trim();

      const result = await sessionPort.writeZeroCodeConfig({
        defaultModelId: (form.defaultModelId.trim() || id),
        models: [writeModel],
      });
      setSavedHint(
        intl.formatMessage(
          { id: "settings.zeroCodeConfig.saved" },
          { path: result.configPath },
        ),
      );
      const next = await sessionPort.readZeroCodeConfig();
      applySnapshot(next);
    } catch (saveError) {
      logger.error("[ZeroCodeConfig] write failed", { error: saveError });
      setError(
        intl.formatMessage(
          { id: "settings.zeroCodeConfig.saveError" },
          {
            error: saveError instanceof Error ? saveError.message : String(saveError),
          },
        ),
      );
    } finally {
      setSaving(false);
    }
  }, [apiKeySet, applySnapshot, form, intl, sessionPort]);

  if (loading) {
    return (
      <div
        className="flex items-center gap-2 text-ui-base text-foreground-subtle"
        data-testid="zerocode-config-loading"
      >
        <Loader2Icon className="size-4 animate-spin" />
        {intl.formatMessage({ id: "common.loading" })}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="zerocode-config-section">
      <p className="text-ui-base text-foreground-subtle">
        {intl.formatMessage({ id: "settings.zeroCodeConfig.description" })}
      </p>
      {snapshot?.configPath ? (
        <p className="text-ui-xs text-foreground-subtle" data-testid="zerocode-config-path">
          {intl.formatMessage(
            { id: "settings.zeroCodeConfig.path" },
            { path: snapshot.configPath },
          )}
        </p>
      ) : null}

      <SettingsGroupCard>
        <SettingsRow
          controlLayout="wide"
          label={intl.formatMessage({ id: "settings.zeroCodeConfig.id" })}
          description={intl.formatMessage({ id: "settings.zeroCodeConfig.idHint" })}
          control={
            <Input
              data-testid="zerocode-config-id"
              value={form.id}
              onChange={(event) => setForm((prev) => ({ ...prev, id: event.target.value }))}
              placeholder="my-provider"
              autoComplete="off"
            />
          }
        />
        <SettingsRow
          controlLayout="wide"
          label={intl.formatMessage({ id: "settings.zeroCodeConfig.name" })}
          control={
            <Input
              data-testid="zerocode-config-name"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              autoComplete="off"
            />
          }
        />
        <SettingsRow
          controlLayout="wide"
          label={intl.formatMessage({ id: "settings.zeroCodeConfig.baseUrl" })}
          control={
            <Input
              data-testid="zerocode-config-base-url"
              value={form.baseUrl}
              onChange={(event) => setForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
              placeholder="https://api.example.com/v1"
              autoComplete="off"
            />
          }
        />
        <SettingsRow
          controlLayout="wide"
          label={intl.formatMessage({ id: "settings.zeroCodeConfig.model" })}
          description={intl.formatMessage({ id: "settings.zeroCodeConfig.modelHint" })}
          control={
            <Input
              data-testid="zerocode-config-model"
              value={form.model}
              onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
              autoComplete="off"
            />
          }
        />
        <SettingsRow
          controlLayout="wide"
          label={intl.formatMessage({ id: "settings.zeroCodeConfig.apiKey" })}
          description={
            apiKeySet
              ? intl.formatMessage(
                  { id: "settings.zeroCodeConfig.apiKeySetHint" },
                  { masked: apiKeyMasked ?? "****" },
                )
              : intl.formatMessage({ id: "settings.zeroCodeConfig.apiKeyHint" })
          }
          control={
            <Input
              data-testid="zerocode-config-api-key"
              type="password"
              value={form.apiKey}
              onChange={(event) => setForm((prev) => ({ ...prev, apiKey: event.target.value }))}
              placeholder={apiKeySet ? "••••••••" : ""}
              autoComplete="off"
            />
          }
        />
        <SettingsRow
          controlLayout="wide"
          label={intl.formatMessage({ id: "settings.zeroCodeConfig.defaultModelId" })}
          description={intl.formatMessage({ id: "settings.zeroCodeConfig.defaultModelIdHint" })}
          control={
            <Input
              data-testid="zerocode-config-default-model"
              value={form.defaultModelId}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, defaultModelId: event.target.value }))
              }
              autoComplete="off"
            />
          }
        />
      </SettingsGroupCard>

      {error ? (
        <Alert variant="destructive" data-testid="zerocode-config-error">
          <TriangleAlertIcon className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {savedHint ? (
        <Alert data-testid="zerocode-config-saved">
          <AlertDescription>{savedHint}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          data-testid="zerocode-config-save"
          disabled={saving || !sessionPort}
          onClick={() => void onSave()}
        >
          {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {intl.formatMessage({ id: "settings.zeroCodeConfig.save" })}
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="zerocode-config-reload"
          disabled={saving || !sessionPort}
          onClick={() => void reload()}
        >
          {intl.formatMessage({ id: "settings.zeroCodeConfig.reload" })}
        </Button>
      </div>
    </div>
  );
}
