import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Check,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  PlugZap,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  VirtualizedSelect,
  VirtualizedSelectOption,
} from "@/components/ui/virtualized-select";
import { cn } from "@/lib/utils";
import {
  AGENT_DEFAULT_BASE_URL,
  AiModelInfo,
  AiProviderProfile,
  AiProvidersState,
} from "@/types/Agent";
import { Hint } from "@renderer/components/Hint";
import { classifyAgentError } from "./providerErrors";
import { showFailureToast } from "@renderer/utilities/failures";

const api = window.api;

type FormState = {
  id?: string;
  label: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  hasStoredKey: boolean;
  keyHint: string;
};

function emptyForm(): FormState {
  return {
    label: "",
    baseUrl: AGENT_DEFAULT_BASE_URL,
    model: "",
    apiKey: "",
    hasStoredKey: false,
    keyHint: "",
  };
}

function formFromProfile(profile: AiProviderProfile): FormState {
  return {
    id: profile.id,
    label: profile.label,
    baseUrl: profile.baseUrl,
    model: profile.model,
    apiKey: "",
    hasStoredKey: profile.hasKey,
    keyHint: profile.keyHint,
  };
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

function ProviderRow({
  provider,
  isActive,
  isPendingDelete,
  onSelect,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  provider: AiProviderProfile;
  isActive: boolean;
  isPendingDelete: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const { t } = useTranslation();

  if (isPendingDelete) {
    return (
      <div className="flex h-14 min-w-0 items-center gap-2 rounded-lg border border-destructive/40 bg-surface-2 px-3">
        <TriangleAlert className="size-4 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1 text-xs text-muted-foreground">
          {t("agent.providers.deleteConfirm", { name: provider.label })}
        </span>
        <Button variant="secondary" size="sm" onClick={onCancelDelete}>
          {t("common.cancel")}
        </Button>
        <Button variant="destructive" size="sm" onClick={onConfirmDelete}>
          {t("common.delete")}
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-14 min-w-0 items-center gap-2.5 rounded-lg border px-3 transition-colors",
        isActive
          ? "border-primary/40 bg-primary-soft-raised"
          : "border-border bg-surface-2 hover:bg-surface-3",
      )}
    >
      <button
        type="button"
        aria-pressed={isActive}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={onSelect}
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border",
            isActive
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input",
          )}
        >
          {isActive && <Check className="size-3" />}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <Hint content={provider.label} variant="text" truncatedOnly>
              <span className="min-w-0 truncate text-sm font-medium text-foreground">
                {provider.label}
              </span>
            </Hint>
            {isActive && (
              <span className="shrink-0 rounded bg-primary/20 px-1.5 text-[0.6rem] leading-4 font-medium text-foreground">
                {t("agent.providers.active")}
              </span>
            )}
          </span>

          <span className="flex min-w-0 items-center gap-2 text-[0.7rem] text-faint">
            <Hint content={provider.model} variant="text" truncatedOnly>
              <span className="min-w-0 truncate font-mono">
                {provider.model}
              </span>
            </Hint>
            <span className="shrink-0">·</span>
            {provider.hasKey ? (
              <span className="shrink-0 font-mono">{provider.keyHint}</span>
            ) : (
              <span className="shrink-0 text-warning">
                {t("agent.providers.keyMissing")}
              </span>
            )}
            <span className="shrink-0">·</span>
            <span className="shrink-0 font-mono">
              {hostOf(provider.baseUrl)}
            </span>
          </span>
        </span>
      </button>

      <Hint content={t("agent.providers.edit")}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${t("agent.providers.edit")} — ${provider.label}`}
          onClick={onEdit}
        >
          <Pencil />
        </Button>
      </Hint>
      <Hint content={t("agent.providers.delete")}>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-faint hover:text-destructive"
          aria-label={`${t("agent.providers.delete")} — ${provider.label}`}
          onClick={onAskDelete}
        >
          <Trash2 />
        </Button>
      </Hint>
    </div>
  );
}

export function AgentProvidersModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [state, setState] = useState<AiProvidersState | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [models, setModels] = useState<AiModelInfo[]>([]);
  const [manualModel, setManualModel] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testOk, setTestOk] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    const next = await api.agent.providers.list();
    setLoadFailed(next === null);
    if (next) setState(next);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const modelOptions = useMemo<VirtualizedSelectOption[]>(
    () =>
      models.map((model) => ({
        value: model.id,
        label: model.label,
        badge: model.supportsTools
          ? undefined
          : {
              label: t("agent.providers.noTools"),
              className: "bg-destructive/15 text-destructive",
            },
      })),
    [models, t],
  );

  const selectedModelInfo = form
    ? models.find((model) => model.id === form.model)
    : undefined;

  const report = useMemo(
    () => (testError ? classifyAgentError({ message: testError }) : null),
    [testError],
  );

  function openForm(profile?: AiProviderProfile) {
    setForm(profile ? formFromProfile(profile) : emptyForm());
    setModels([]);
    setManualModel(!profile);
    setTestError(null);
    setTestOk(false);
    setPendingDelete(null);
  }

  function closeForm() {
    setForm(null);
    setModels([]);
    setTestError(null);
    setTestOk(false);
  }

  async function handleTest() {
    if (!form) return;

    setTesting(true);
    setTestError(null);
    setTestOk(false);

    try {
      const result = await api.agent.providers.test({
        id: form.id,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey || undefined,
      });

      if (!result) {
        showFailureToast(t("agent.providers.testFailed"), undefined, {
          channels: ["agent:"],
        });
        return;
      }

      if (result.ok) {
        setModels(result.models);
        setManualModel(result.models.length === 0);
        setTestOk(true);
        return;
      }

      setTestError(result.message);
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (!form) return;

    setSaving(true);
    try {
      const next = await api.agent.providers.save({
        id: form.id,
        label: form.label.trim(),
        baseUrl: form.baseUrl.trim(),
        model: form.model.trim(),
        apiKey: form.apiKey || undefined,
      });

      if (!next?.providers.length) {
        showFailureToast(t("agent.providers.saveFailed"), undefined, {
          channels: ["agent:"],
        });
        return;
      }

      setState(next);
      closeForm();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setPendingDelete(null);
    const next = await api.agent.providers.remove(id);

    if (!next) {
      showFailureToast(t("agent.providers.deleteFailed"), undefined, {
        channels: ["agent:providers:delete"],
      });
      return;
    }

    setState(next);
  }

  async function handleSelect(id: string) {
    const next = await api.agent.providers.select(id);

    if (!next) {
      showFailureToast(t("agent.providers.selectFailed"), undefined, {
        channels: ["agent:providers:select"],
      });
      return;
    }

    setState(next);
  }

  const canSave =
    Boolean(form?.label.trim()) &&
    Boolean(form?.baseUrl.trim()) &&
    Boolean(form?.model.trim()) &&
    Boolean(form?.apiKey || form?.hasStoredKey);

  const saveBlockedReason = !form
    ? undefined
    : !form.label.trim()
      ? t("agent.providers.blocked.label")
      : !form.baseUrl.trim()
        ? t("agent.providers.blocked.baseUrl")
        : !(form.apiKey || form.hasStoredKey)
          ? t("agent.providers.blocked.apiKey")
          : !form.model.trim()
            ? t("agent.providers.blocked.model")
            : undefined;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[86vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="shrink-0 flex-row items-start gap-3 px-4 pt-4 pb-3 text-left">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft-raised text-primary">
            <PlugZap className="size-4" />
          </span>
          <div className="grid min-w-0 gap-1">
            <DialogTitle className="text-sm leading-5">
              {form
                ? form.id
                  ? t("agent.providers.editTitle")
                  : t("agent.providers.addTitle")
                : t("agent.providers.title")}
            </DialogTitle>
            <DialogDescription className="text-xs leading-4.5 text-muted-foreground">
              {form
                ? t("agent.providers.formDescription")
                : t("agent.providers.listDescription")}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-4">
          {!state ? (
            loadFailed ? (
              <div className="grid justify-items-center gap-2 rounded-xl border border-destructive/40 bg-surface-2 px-4 py-8 text-center">
                <TriangleAlert className="size-5 text-destructive" />
                <span className="text-sm font-medium text-foreground">
                  {t("agent.providers.loadFailed")}
                </span>
                <span className="max-w-xs text-xs leading-4.5 text-muted-foreground">
                  {t("agent.providers.loadFailedHint")}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => {
                    setLoadFailed(false);
                    void load();
                  }}
                >
                  {t("common.retry")}
                </Button>
              </div>
            ) : (
              <div className="grid min-w-0 gap-2">
                <Skeleton className="h-14 w-full rounded-lg" />
                <Skeleton className="h-14 w-full rounded-lg" />
              </div>
            )
          ) : form ? (
            <div className="grid min-w-0 gap-3">
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor="agent-provider-label">
                  {t("agent.providers.label")}
                </Label>
                <Input
                  id="agent-provider-label"
                  value={form.label}
                  placeholder={t("agent.providers.labelPlaceholder")}
                  onChange={(event) =>
                    setForm({ ...form, label: event.target.value })
                  }
                />
              </div>

              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor="agent-provider-base-url">
                  {t("agent.providers.baseUrl")}
                </Label>
                <Input
                  id="agent-provider-base-url"
                  value={form.baseUrl}
                  spellCheck={false}
                  className="font-mono text-xs"
                  onChange={(event) =>
                    setForm({ ...form, baseUrl: event.target.value })
                  }
                />
                <p className="text-[0.7rem] leading-4 text-faint">
                  {t("agent.providers.baseUrlHint")}
                </p>
              </div>

              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor="agent-provider-key">
                  {t("agent.providers.apiKey")}
                </Label>
                <Input
                  id="agent-provider-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={form.apiKey}
                  className="font-mono text-xs"
                  placeholder={
                    form.hasStoredKey
                      ? t("agent.providers.apiKeyStored", {
                          hint: form.keyHint,
                        })
                      : t("agent.providers.apiKeyPlaceholder")
                  }
                  onChange={(event) =>
                    setForm({ ...form, apiKey: event.target.value })
                  }
                />
                <p className="flex items-start gap-1.5 rounded-lg bg-surface-2 px-2.5 py-2 text-[0.7rem] leading-4 text-muted-foreground">
                  <ShieldCheck className="mt-px size-3.5 shrink-0 text-success" />
                  {t("agent.providers.keyPrivacy", {
                    host: hostOf(form.baseUrl),
                  })}
                </p>
              </div>

              <div className="grid min-w-0 gap-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={testing || !form.baseUrl.trim()}
                    onClick={handleTest}
                  >
                    {testing ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <PlugZap />
                    )}
                    {testing
                      ? t("agent.providers.testing")
                      : t("agent.providers.test")}
                  </Button>
                  {testOk && (
                    <span className="flex min-w-0 items-center gap-1 text-xs text-success">
                      <Check className="size-3.5 shrink-0" />
                      <span className="truncate">
                        {t("agent.providers.testOk", { count: models.length })}
                      </span>
                    </span>
                  )}
                </div>

                {!testOk && !report && (
                  <p className="text-[0.7rem] leading-4 text-faint">
                    {t("agent.providers.testHint")}
                  </p>
                )}
              </div>

              {report && (
                <div className="grid min-w-0 gap-1 rounded-lg border border-destructive/40 bg-surface-2 px-3 py-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                    <TriangleAlert className="size-3.5 shrink-0" />
                    {t(report.titleKey)}
                  </span>
                  <span className="text-[0.7rem] leading-4 text-muted-foreground">
                    {t(report.hintKey)}
                  </span>
                  {report.detail && (
                    <span className="line-clamp-2 font-mono text-[0.65rem] leading-4 break-all text-faint">
                      {report.detail}
                    </span>
                  )}
                </div>
              )}

              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor="agent-provider-model">
                  {t("agent.providers.defaultModel")}
                </Label>
                {manualModel || modelOptions.length === 0 ? (
                  <Input
                    id="agent-provider-model"
                    value={form.model}
                    spellCheck={false}
                    className="font-mono text-xs"
                    placeholder={t("agent.providers.modelPlaceholder")}
                    onChange={(event) =>
                      setForm({ ...form, model: event.target.value })
                    }
                  />
                ) : (
                  <VirtualizedSelect
                    value={form.model}
                    onValueChange={(value) =>
                      setForm({ ...form, model: value })
                    }
                    options={modelOptions}
                    placeholder={t("agent.providers.modelPlaceholder")}
                    searchPlaceholder={t("agent.providers.modelSearch")}
                    emptyText={t("agent.providers.modelEmpty")}
                    aria-label={t("agent.providers.model")}
                  />
                )}

                <div className="flex items-baseline gap-2">
                  <p className="min-w-0 flex-1 text-[0.7rem] leading-4 text-faint">
                    {t("agent.providers.defaultModelHint")}
                  </p>
                  {modelOptions.length > 0 && (
                    <button
                      type="button"
                      className="shrink-0 rounded text-[0.7rem] text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      onClick={() => setManualModel((value) => !value)}
                    >
                      {manualModel
                        ? t("agent.providers.modelFromList")
                        : t("agent.providers.modelManual")}
                    </button>
                  )}
                </div>

                {selectedModelInfo && !selectedModelInfo.supportsTools && (
                  <p className="flex items-start gap-1.5 rounded-lg border border-warning/40 bg-surface-2 px-2.5 py-2 text-[0.7rem] leading-4 text-warning">
                    <TriangleAlert className="mt-px size-3.5 shrink-0" />
                    {t("agent.providers.noToolsWarning")}
                  </p>
                )}
              </div>
            </div>
          ) : state.providers.length === 0 ? (
            <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-input px-4 py-8 text-center">
              <span className="flex size-10 items-center justify-center rounded-xl bg-surface-2 text-faint">
                <KeyRound className="size-5" />
              </span>
              <span className="text-sm font-medium text-foreground">
                {t("agent.providers.empty")}
              </span>
              <span className="max-w-xs text-xs leading-4.5 text-muted-foreground">
                {t("agent.providers.emptyHint")}
              </span>
            </div>
          ) : (
            <div className="grid min-w-0 gap-2">
              <p className="flex items-start gap-1.5 rounded-lg bg-surface-2 px-2.5 py-2 text-[0.7rem] leading-4 text-muted-foreground">
                <ShieldCheck className="mt-px size-3.5 shrink-0 text-success" />
                {t("agent.providers.description")}
              </p>

              {state.providers.map((provider) => (
                <ProviderRow
                  key={provider.id}
                  provider={provider}
                  isActive={provider.id === state.selectedId}
                  isPendingDelete={pendingDelete === provider.id}
                  onSelect={() => void handleSelect(provider.id)}
                  onEdit={() => openForm(provider)}
                  onAskDelete={() => setPendingDelete(provider.id)}
                  onCancelDelete={() => setPendingDelete(null)}
                  onConfirmDelete={() => void handleDelete(provider.id)}
                />
              ))}

              <p className="text-[0.7rem] leading-4 text-faint">
                {t("agent.providers.selectHint")}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="m-0 shrink-0 gap-2 rounded-none border-t border-border bg-surface-2 px-4 py-3 sm:justify-between">
          {form ? (
            <>
              <Button variant="ghost" size="sm" onClick={closeForm}>
                <ArrowLeft />
                {t("agent.providers.cancel")}
              </Button>
              <Hint content={saveBlockedReason}>
                <Button
                  size="sm"
                  disabled={!canSave || saving}
                  onClick={handleSave}
                >
                  {saving && <Loader2 className="animate-spin" />}
                  {t("agent.providers.save")}
                </Button>
              </Hint>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onClose}>
                {t("common.close")}
              </Button>
              <Button size="sm" disabled={!state} onClick={() => openForm()}>
                <Plus />
                {t("agent.providers.add")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
