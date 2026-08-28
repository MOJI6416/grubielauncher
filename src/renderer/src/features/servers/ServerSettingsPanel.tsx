import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Gamepad2,
  Loader2,
  MemoryStick,
  Network,
  Package,
  RotateCcw,
  Save,
  Shield,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { IServerConf, IServerSettings } from "@/types/Server";
import { ILocalProject } from "@/types/ModManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { registerNavigationBlocker } from "@renderer/navigation/guards";
import { showFailureToast } from "@renderer/utilities/failures";
import {
  DIFFICULTIES,
  GAME_MODES,
  ServerDraft,
  changedFields,
  clampNumber,
  normalizeDraft,
} from "./serverProperties";

const api = window.api;

function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-center justify-between gap-3 border-b px-3 py-1.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-faint">{icon}</span>
          <span className="truncate text-xs font-medium">{title}</span>
        </span>
        {action}
      </header>
      <div className="grid gap-2 p-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="text-[0.7rem] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-accent/40">
      <span className="min-w-0 truncate">{label}</span>
      <Switch
        className="shrink-0 scale-90"
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
      />
    </label>
  );
}

function SectionSkeleton({ rows }: { rows: number[] }) {
  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-center justify-between gap-3 border-b px-3 py-1.5">
        <span className="flex items-center gap-2">
          <Skeleton className="size-3.5 rounded" />
          <Skeleton className="h-2.5 w-24 rounded" />
        </span>
        <Skeleton className="h-2.5 w-10 rounded" />
      </header>
      <div className="grid gap-2 p-3">
        {rows.map((height, index) => (
          <Skeleton key={index} className="w-full rounded-lg" style={{ height }} />
        ))}
      </div>
    </section>
  );
}

function ServerSettingsSkeleton() {
  return (
    <div aria-busy className="flex h-full min-h-0 flex-col gap-3">
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-3 overflow-hidden">
        <div className="grid content-start gap-3">
          <SectionSkeleton rows={[16, 28]} />
          <SectionSkeleton rows={[44, 44]} />
        </div>
        <div className="grid content-start gap-3">
          <SectionSkeleton rows={[44, 44]} />
          <SectionSkeleton rows={[44, 44, 44]} />
        </div>
        <div className="grid content-start gap-3">
          <SectionSkeleton rows={[26, 26, 26, 26, 26, 26, 26, 26, 26, 26]} />
        </div>
      </div>

      <div className="flex h-13 shrink-0 items-center gap-2 rounded-xl border bg-card px-3">
        <Skeleton className="h-2.5 w-40 rounded" />
        <Skeleton className="ml-auto h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-lg" />
      </div>
    </div>
  );
}

export function ServerSettingsPanel({
  serverPath,
  conf,
  resourcePacks,
  runningPort,
  onSaved,
}: {
  serverPath: string;
  conf: IServerConf;
  resourcePacks: ILocalProject[];
  runningPort?: number;
  onSaved: (conf: IServerConf) => void;
}) {
  const { t } = useTranslation();

  const [baseline, setBaseline] = useState<ServerDraft | null>(null);
  const [draft, setDraft] = useState<ServerDraft | null>(null);
  const [totalMemory, setTotalMemory] = useState(0);
  const [portInUse, setPortInUse] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [readError, setReadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const confRef = useRef(conf);
  confRef.current = conf;

  const readFromDisk = useCallback(async (): Promise<ServerDraft | null> => {
    const settings = await api.server.getSettings(
      await api.path.join(serverPath, "server.properties"),
    );
    if (!settings) return null;

    const run = await api.server.runOptions(serverPath);

    return {
      settings,
      memory: run?.memory ?? confRef.current.memory,
      aikarFlags: run?.aikarFlags ?? confRef.current.aikarFlags ?? false,
    };
  }, [serverPath]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const initial = await readFromDisk();
      const total = await api.os.totalmem();
      if (cancelled) return;

      if (!initial) {
        setReadError(true);
        return;
      }

      setReadError(false);
      setBaseline(initial);
      setDraft({ ...initial, settings: { ...initial.settings } });
      setTotalMemory(Math.floor(total / (1024 * 1024)));
    })();

    return () => {
      cancelled = true;
    };
  }, [readFromDisk, reloadToken]);

  const changed = useMemo(
    () => (draft && baseline ? changedFields(draft, baseline) : []),
    [draft, baseline],
  );
  const isDirty = changed.length > 0;

  useEffect(() => {
    return registerNavigationBlocker("server-settings", () => isDirty);
  }, [isDirty]);

  const port = draft?.settings.serverPort;

  useEffect(() => {
    if (port === undefined) return;

    if (runningPort !== undefined && port === runningPort) {
      setPortInUse(false);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(() => {
      void api.server
        .isPortAvailable(port)
        .then((available) => {
          if (!cancelled) setPortInUse(!available);
        })
        .catch(() => {
          if (!cancelled) setPortInUse(false);
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [port, runningPort]);

  const patch = useCallback((next: Partial<IServerSettings>) => {
    setDraft((prev) =>
      prev ? { ...prev, settings: { ...prev.settings, ...next } } : prev,
    );
  }, []);

  const save = useCallback(async () => {
    if (!draft || !baseline) return;

    const normalized = normalizeDraft(draft);
    setIsSaving(true);

    const failedChannels: string[] = [];
    const failedParts: string[] = [];

    try {
      let memoryWritten = normalized.memory === baseline.memory;
      if (!memoryWritten) {
        memoryWritten = await api.server.editXmx(serverPath, normalized.memory);
        if (!memoryWritten) {
          failedChannels.push("server:editXmx");
          failedParts.push(t("settings.memory"));
        }
      }

      let aikarWritten = normalized.aikarFlags === baseline.aikarFlags;
      if (!aikarWritten) {
        aikarWritten = await api.server.setAikar(
          serverPath,
          normalized.aikarFlags,
        );
        if (!aikarWritten) {
          failedChannels.push("server:setAikar");
          failedParts.push(t("versions.aikarFlags"));
        }
      }

      if (
        !(await api.server.updateProperties(
          await api.path.join(serverPath, "server.properties"),
          normalized.settings,
        ))
      ) {
        failedChannels.push("server:updateProperties");
        failedParts.push(t("serverManager.partProperties"));
      }

      const applied = await readFromDisk();

      const nextConf: IServerConf = {
        ...conf,
        memory:
          applied?.memory ??
          (memoryWritten ? normalized.memory : baseline.memory),
        aikarFlags:
          applied?.aikarFlags ??
          (aikarWritten ? normalized.aikarFlags : baseline.aikarFlags),
      };

      if (
        nextConf.memory !== conf.memory ||
        nextConf.aikarFlags !== (conf.aikarFlags ?? false)
      ) {
        if (
          await api.fs.writeJSON(
            await api.path.join(serverPath, "conf.json"),
            nextConf,
          )
        ) {
          onSaved(nextConf);
        } else {
          failedChannels.push("fs:writeJSON");
          failedParts.push(t("serverManager.partRecord"));
        }
      }

      const truth: ServerDraft = applied ?? {
        settings: normalized.settings,
        memory: nextConf.memory,
        aikarFlags: nextConf.aikarFlags === true,
      };

      setBaseline(truth);
      if (!failedParts.length) {
        setDraft({ ...truth, settings: { ...truth.settings } });
        toast.success(t("settings.saved"));
        return;
      }

      showFailureToast(
        t("serverManager.savePartial", { parts: failedParts.join(", ") }),
        undefined,
        {
          channels: failedChannels,
          fallbackDescription: t("serverManager.savePartialHint"),
        },
      );
    } finally {
      setIsSaving(false);
    }
  }, [draft, baseline, conf, serverPath, onSaved, readFromDisk, t]);

  if (readError) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 rounded-xl border bg-card p-6 text-center">
        <TriangleAlert className="size-5 text-warning" />
        <p className="text-sm font-medium">
          {t("serverManager.settingsUnreadable")}
        </p>
        <p className="max-w-md text-xs text-muted-foreground">
          {t("serverManager.settingsUnreadableHint")}
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-1"
          onClick={() => {
            setReadError(false);
            setReloadToken((value) => value + 1);
          }}
        >
          <RotateCcw className="size-3.5" />
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  if (!draft || !baseline) {
    return <ServerSettingsSkeleton />;
  }

  const settings = draft.settings;
  const maxMemory = Math.max(2048, totalMemory - 1024);

  const rules: [string, keyof IServerSettings][] = [
    [t("serverSettings.whitelist"), "whitelist"],
    [t("serverSettings.onlineMode"), "onlineMode"],
    ["PVP", "pvp"],
    [t("serverSettings.enableCommandBlock"), "enableCommandBlock"],
    [t("serverSettings.allowFlight"), "allowFlight"],
    [t("serverSettings.forceGamemode"), "forceGamemode"],
    [t("serverSettings.spawnAnimals"), "spawnAnimals"],
    [t("serverSettings.spawnMonsters"), "spawnMonsters"],
    [t("serverSettings.spawnNPCs"), "spawnNpcs"],
    [t("serverSettings.allowNether"), "allowNether"],
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-3 overflow-y-auto">
        <div className="grid content-start gap-3">
          <Section
            title={t("settings.memory")}
            icon={<MemoryStick className="size-3.5" />}
            action={
              <span className="font-mono text-xs tabular-nums">
                {draft.memory} {t("settings.mb")}
              </span>
            }
          >
            <Slider
              step={512}
              min={1024}
              max={maxMemory}
              value={[Math.min(draft.memory, maxMemory)]}
              onValueChange={([value]) =>
                typeof value === "number" &&
                setDraft((prev) => (prev ? { ...prev, memory: value } : prev))
              }
            />
            <Toggle
              label={t("versions.aikarFlags")}
              checked={draft.aikarFlags}
              onChange={(value) =>
                setDraft((prev) => (prev ? { ...prev, aikarFlags: value } : prev))
              }
            />
          </Section>

          <Section
            title={t("serverSettings.sections.connection")}
            icon={<Network className="size-3.5" />}
          >
            <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
              <Field label="IP">
                <Input
                  className="h-8 font-mono text-xs"
                  value={settings.serverIp}
                  placeholder="0.0.0.0"
                  onChange={(event) =>
                    patch({ serverIp: event.currentTarget.value })
                  }
                />
              </Field>
              <Field label={t("serverSettings.port")}>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  className="h-8 font-mono text-xs"
                  value={settings.serverPort}
                  onChange={(event) =>
                    patch({
                      serverPort: clampNumber(
                        Number(event.currentTarget.value),
                        1,
                        65535,
                      ),
                    })
                  }
                />
              </Field>
            </div>
            {portInUse && (
              <p className="text-[0.7rem] text-warning">
                {t("serverSettings.portInUse", { port: settings.serverPort })}
              </p>
            )}
            <Field label={t("serverSettings.description")}>
              <Input
                className="h-8 text-xs"
                value={settings.motd}
                onChange={(event) => patch({ motd: event.currentTarget.value })}
              />
            </Field>
          </Section>

        </div>

        <div className="grid content-start gap-3">
          <Section
            title={t("serverSettings.sections.game")}
            icon={<Gamepad2 className="size-3.5" />}
          >
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("serverSettings.gameMode")}>
                <Select
                  value={settings.gameMode}
                  onValueChange={(value) => patch({ gameMode: value })}
                >
                  <SelectTrigger size="sm" className="h-8 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GAME_MODES.map((mode, index) => (
                      <SelectItem key={mode} value={mode}>
                        {t(`serverSettings.gameModes.${index}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label={t("serverSettings.difficulty")}>
                <Select
                  value={settings.difficulty}
                  onValueChange={(value) => patch({ difficulty: value })}
                >
                  <SelectTrigger size="sm" className="h-8 w-full text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map((value, index) => (
                      <SelectItem key={value} value={value}>
                        {t(`serverSettings.difficulties.${index}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label={t("serverSettings.maxPlayers")}>
                <Input
                  type="number"
                  min={1}
                  className="h-8 font-mono text-xs"
                  value={settings.maxPlayers}
                  onChange={(event) =>
                    patch({
                      maxPlayers: clampNumber(
                        Number(event.currentTarget.value),
                        1,
                        2000,
                      ),
                    })
                  }
                />
              </Field>

              <Field label={t("serverSettings.spawnProtection")}>
                <Input
                  type="number"
                  min={0}
                  className="h-8 font-mono text-xs"
                  value={settings.spawnProtection}
                  onChange={(event) =>
                    patch({
                      spawnProtection: clampNumber(
                        Number(event.currentTarget.value),
                        0,
                        29999984,
                      ),
                    })
                  }
                />
              </Field>
            </div>
          </Section>

          <Section
            title={t("serverSettings.resourcePack")}
            icon={<Package className="size-3.5" />}
            action={
              <Switch
                className="scale-90"
                checked={settings.requireResourcePack}
                onCheckedChange={(value) =>
                  patch({ requireResourcePack: value === true })
                }
              />
            }
          >
            {resourcePacks.length > 0 && (
              <Field label={t("serverSettings.fromInstance")}>
                <Select
                  disabled={!settings.requireResourcePack}
                  value={settings.resourcePack || undefined}
                  onValueChange={(value) => patch({ resourcePack: value })}
                >
                  <SelectTrigger size="sm" className="h-8 w-full text-xs">
                    <SelectValue placeholder={t("common.select")} />
                  </SelectTrigger>
                  <SelectContent>
                    {resourcePacks.map((pack, index) => {
                      const url = pack.version?.files[0].url;
                      return (
                        <SelectItem
                          key={url || index}
                          value={url || String(index)}
                        >
                          {pack.title}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </Field>
            )}

            <Field label="URL">
              <Input
                className="h-8 font-mono text-xs"
                disabled={!settings.requireResourcePack}
                value={settings.resourcePack}
                onChange={(event) =>
                  patch({ resourcePack: event.currentTarget.value })
                }
              />
            </Field>

            <Field label={t("serverSettings.requestResourcePack")}>
              <Input
                className="h-8 text-xs"
                disabled={!settings.requireResourcePack}
                value={settings.resourcePackPrompt}
                onChange={(event) =>
                  patch({ resourcePackPrompt: event.currentTarget.value })
                }
              />
            </Field>
          </Section>
        </div>

        <div className="grid content-start gap-3">
          <Section
            title={t("serverSettings.sections.rules")}
            icon={<Shield className="size-3.5" />}
          >
            <div className="grid gap-0.5">
              {rules.map(([label, key]) => (
                <Toggle
                  key={key}
                  label={label}
                  checked={settings[key] === true}
                  onChange={(value) =>
                    patch({ [key]: value } as Partial<IServerSettings>)
                  }
                />
              ))}
            </div>
          </Section>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 rounded-xl border bg-card px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {isDirty
            ? t("serverManager.pendingChanges", { total: changed.length })
            : t("serverManager.noChanges")}
          {runningPort !== undefined && (
            <span className="text-faint">
              {" · "}
              {t("serverManager.applyAfterRestart")}
            </span>
          )}
        </span>

        <Button
          variant="ghost"
          size="sm"
          disabled={!isDirty || isSaving}
          onClick={() =>
            setDraft({ ...baseline, settings: { ...baseline.settings } })
          }
        >
          <RotateCcw className="size-3.5" />
          {t("common.reset")}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          disabled={!isDirty || isSaving}
          onClick={() => void save()}
        >
          {isSaving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          {t("serverManager.apply")}
        </Button>
      </div>
    </div>
  );
}
