import { useMemo, useState } from "react";
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import { onRadioKeyDown, radioFocusIndex } from "@renderer/utilities/radioKeys";
import { countFeature } from "@renderer/features/usage/usage";
import { useAgentProviders } from "./useAgentProviders";

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

export function ProviderRow({
  provider,
  isActive,
  tabIndex,
  onSelect,
  onEdit,
  onAskDelete,
}: {
  provider: AiProviderProfile;
  isActive: boolean;
  tabIndex: number;
  onSelect: () => void;
  onEdit: () => void;
  onAskDelete: () => void;
}) {
  const { t } = useTranslation();

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
        role="radio"
        aria-checked={isActive}
        tabIndex={tabIndex}
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
              <span className="shrink-0 rounded bg-primary/20 px-1.5 text-3xs leading-4 font-medium text-foreground">
                {t("agent.providers.active")}
              </span>
            )}
          </span>

          {provider.builtin ? (
            <Hint
              content={t("agent.providers.builtinHint")}
              variant="text"
              truncatedOnly
            >
              <span className="min-w-0 truncate text-2xs text-faint">
                {t("agent.providers.builtinHint")}
              </span>
            </Hint>
          ) : (
            <span className="flex min-w-0 items-center gap-2 text-2xs text-faint">
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
          )}
        </span>
      </button>

      {!provider.builtin && (
        <>
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
        </>
      )}
    </div>
  );
}

export function AgentProvidersModal({
  onClose,
  startWith,
  onSaved,
}: {
  onClose: () => void;
  startWith?: "new" | AiProviderProfile;
  onSaved?: (state: AiProvidersState) => void;
}) {
  const { t } = useTranslation();
  const providers = useAgentProviders();
  const { state, setState, loadFailed, load } = providers;
  const [form, setForm] = useState<FormState | null>(() =>
    startWith === "new"
      ? emptyForm()
      : startWith
        ? formFromProfile(startWith)
        : null,
  );
  const [models, setModels] = useState<AiModelInfo[]>([]);
  const [manualModel, setManualModel] = useState(startWith === "new");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testOk, setTestOk] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AiProviderProfile | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

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
    if (startWith) {
      onClose();
      return;
    }
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
    } catch (error) {
      showFailureToast(t("agent.providers.testFailed"), error, {
        channels: ["agent:"],
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (!form) return;
    countFeature("agent.provider");

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
      onSaved?.(next);
      closeForm();
    } catch (error) {
      showFailureToast(t("agent.providers.saveFailed"), error, {
        channels: ["agent:"],
      });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(id: string) {
    setDeleting(true);
    try {
      await providers.remove(id);
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  async function handleSelect(id: string) {
    await providers.select(id);
  }

  const providerIds = state?.providers.map((provider) => provider.id) ?? [];
  const providerFocus = radioFocusIndex(providerIds, state?.selectedId);

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
        onEscapeKeyDown={(event) => {
          if (!pendingDelete) return;
          event.preventDefault();
          setPendingDelete(null);
        }}
      >
        <DialogHeader className="shrink-0 flex-row items-start gap-3 px-4 pt-4 pb-3 text-left">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-muted-foreground">
            <PlugZap className="size-4" />
          </span>
          <div className="grid min-w-0 gap-1">
            <DialogTitle className="text-sm leading-5">
              {pendingDelete
                ? t("agent.providers.deleteConfirm", {
                    name: pendingDelete.label,
                  })
                : form
                  ? form.id
                    ? t("agent.providers.editTitle")
                    : t("agent.providers.addTitle")
                  : t("agent.providers.title")}
            </DialogTitle>
            <DialogDescription className="text-xs leading-4.5 text-muted-foreground">
              {pendingDelete
                ? t("agent.providers.deleteHint")
                : form
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
                  onClick={() => void load()}
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
          ) : pendingDelete ? (
            <div className="grid min-w-0 gap-2.5">
              <div className="grid min-w-0 gap-0.5 rounded-lg bg-surface-2 px-3 py-2.5">
                <Hint content={pendingDelete.label} variant="text" truncatedOnly>
                  <span className="truncate text-sm font-medium text-foreground">
                    {pendingDelete.label}
                  </span>
                </Hint>
                <Hint
                  content={pendingDelete.model || pendingDelete.baseUrl}
                  variant="text"
                  truncatedOnly
                >
                  <span className="truncate font-mono text-2xs text-faint">
                    {pendingDelete.model || pendingDelete.baseUrl}
                  </span>
                </Hint>
              </div>
              <p className="flex items-center gap-1.5 text-2xs text-destructive">
                <TriangleAlert className="size-3 shrink-0" />
                {t("common.irreversible")}
              </p>
            </div>
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
                <p className="text-2xs leading-4 text-faint">
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
                <p className="flex items-start gap-1.5 rounded-lg bg-surface-2 px-2.5 py-2 text-2xs leading-4 text-muted-foreground">
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
                      <Hint
                        content={t("agent.providers.testOk", {
                          count: models.length,
                        })}
                        variant="text"
                        truncatedOnly
                      >
                        <span className="truncate">
                          {t("agent.providers.testOk", {
                            count: models.length,
                          })}
                        </span>
                      </Hint>
                    </span>
                  )}
                </div>

                {!testOk && !report && (
                  <p className="text-2xs leading-4 text-faint">
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
                  <span className="text-2xs leading-4 text-muted-foreground">
                    {t(report.hintKey)}
                  </span>
                  {report.detail && (
                    <Hint content={report.detail} variant="text" truncatedOnly>
                      <span className="line-clamp-2 font-mono text-3xs leading-4 break-all text-faint">
                        {report.detail}
                      </span>
                    </Hint>
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
                  <p className="min-w-0 flex-1 text-2xs leading-4 text-faint">
                    {t("agent.providers.defaultModelHint")}
                  </p>
                  {modelOptions.length > 0 && (
                    <button
                      type="button"
                      className="shrink-0 rounded text-2xs text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      onClick={() => setManualModel((value) => !value)}
                    >
                      {manualModel
                        ? t("agent.providers.modelFromList")
                        : t("agent.providers.modelManual")}
                    </button>
                  )}
                </div>

                {selectedModelInfo && !selectedModelInfo.supportsTools && (
                  <p className="flex items-start gap-1.5 rounded-lg border border-warning/40 bg-surface-2 px-2.5 py-2 text-2xs leading-4 text-warning">
                    <TriangleAlert className="mt-px size-3.5 shrink-0" />
                    {t("agent.providers.noToolsWarning")}
                  </p>
                )}
              </div>
            </div>
          ) : state.providers.length === 0 ? (
            <Empty className="rounded-xl bg-surface-2 px-4 py-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <KeyRound />
                </EmptyMedia>
                <EmptyTitle>{t("agent.providers.empty")}</EmptyTitle>
                <EmptyDescription className="text-xs">
                  {t("agent.providers.emptyHint")}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" size="sm" onClick={() => openForm()}>
                  <Plus />
                  {t("agent.providers.add")}
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="grid min-w-0 gap-2">
              <p className="flex items-start gap-1.5 rounded-lg bg-surface-2 px-2.5 py-2 text-2xs leading-4 text-muted-foreground">
                <ShieldCheck className="mt-px size-3.5 shrink-0 text-success" />
                {t("agent.providers.description")}
              </p>

              <div
                role="radiogroup"
                aria-label={t("agent.providers.title")}
                className="grid min-w-0 gap-2"
                onKeyDown={(event) =>
                  onRadioKeyDown(
                    event,
                    providerIds,
                    state.selectedId,
                    (id) => void handleSelect(id),
                  )
                }
              >
                {state.providers.map((provider, index) => (
                  <ProviderRow
                    key={provider.id}
                    provider={provider}
                    isActive={provider.id === state.selectedId}
                    tabIndex={index === providerFocus ? 0 : -1}
                    onSelect={() => void handleSelect(provider.id)}
                    onEdit={() => openForm(provider)}
                    onAskDelete={() => setPendingDelete(provider)}
                  />
                ))}
              </div>

              <p className="text-2xs leading-4 text-faint">
                {t("agent.providers.selectHint")}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="m-0 shrink-0 gap-2 border-t border-border bg-surface-2 px-4 py-3 sm:justify-between">
          {pendingDelete ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                autoFocus
                onClick={() => setPendingDelete(null)}
              >
                <ArrowLeft />
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleting}
                onClick={() => void confirmDelete(pendingDelete.id)}
              >
                {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                {t("common.delete")}
              </Button>
            </>
          ) : form ? (
            <>
              <Button variant="ghost" size="sm" onClick={closeForm}>
                <ArrowLeft />
                {t("agent.providers.cancel")}
              </Button>
              <div className="flex min-w-0 items-center gap-2">
                {saveBlockedReason && (
                  <span className="min-w-0 text-2xs leading-4 text-faint">
                    {saveBlockedReason}
                  </span>
                )}
                <Button
                  size="sm"
                  className="shrink-0"
                  disabled={!canSave || saving}
                  onClick={handleSave}
                >
                  {saving && <Loader2 className="animate-spin" />}
                  {t("agent.providers.save")}
                </Button>
              </div>
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
