import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtom, useAtomValue } from "jotai";
import {
  Copy,
  Cpu,
  FolderOpen,
  ImagePlus,
  Loader2,
  Play,
  Coffee,
  HardDriveDownload,
  MemoryStick,
  RefreshCw,
  Square,
  Trash,
  TriangleAlert,
  Users,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { ProjectType } from "@/types/ModManager";
import { VERSION_INSTALL_CANCELLED } from "@/types/InstallationProgress";
import type { IServerSettings, ServerRunState } from "@/types/Server";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  accountAtom,
  installActiveAtom,
  selectedVersionAtom,
  serverAtom,
  settingsAtom,
} from "@renderer/stores/atoms";
import { ServerGame } from "@renderer/classes/ServerGame";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { Hint } from "@renderer/components/Hint";
import { ImageCropper } from "@renderer/components/ImageCropper";
import { showFailureToast } from "@renderer/utilities/failures";
import { getServerRuntime } from "./serverRuntime";
import { ServerConsole } from "./ServerConsole";
import { ServerSettingsPanel } from "./ServerSettingsPanel";
import { MotdText, ServerFavicon, StatusDot } from "./ServerVisuals";
import { parseMotd, stripMotd } from "./motd";
import { DIFFICULTIES, GAME_MODES, formatUptime } from "./serverProperties";
import type { ServerPingState } from "./types";
import { toPingState } from "./types";
import { copyToClipboard } from "@renderer/utilities/clipboard";

const api = window.api;

const MAX_LOG_LINES = 400;

const RUN_ERROR_KEYS: Record<string, string> = {
  server_java_unavailable: "serverManager.runErrorJavaUnavailable",
  server_not_managed: "serverManager.runErrorNotManaged",
  server_run_script_missing: "serverManager.runErrorMissing",
  server_run_script_unreadable: "serverManager.runErrorUnreadable",
  server_not_running: "serverManager.runErrorNotRunning",
  server_already_running: "serverManager.runErrorAlreadyRunning",
  server_start_failed: "serverManager.runErrorStartFailed",
  server_stop_failed: "serverManager.runErrorStopFailed",
  server_command_failed: "serverManager.commandErrorFailed",
  server_command_empty: "serverManager.commandErrorEmpty",
};

const REPAIRABLE_ERRORS = new Set([
  "server_java_unavailable",
  "server_run_script_missing",
  "server_run_script_unreadable",
  "server_start_failed",
]);

function samePath(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.byteLength; index++) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

export function ServerControlPanel({ onDelete }: { onDelete: () => void }) {
  const { t } = useTranslation();
  const [server, setServer] = useAtom(serverAtom);
  const version = useAtomValue(selectedVersionAtom);
  const account = useAtomValue(accountAtom);
  const appSettings = useAtomValue(settingsAtom);
  const isInstallActive = useAtomValue(installActiveAtom);

  const runtime = useMemo(() => getServerRuntime(), []);

  const [serverPath, setServerPath] = useState("");
  const [view, setView] = useState<"console" | "settings">("console");
  const [runState, setRunState] = useState<ServerRunState>("stopped");
  const [log, setLog] = useState<string[]>([]);
  const [logo, setLogo] = useState("");
  const [cropImage, setCropImage] = useState("");
  const [isCropping, setIsCropping] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [port, setPort] = useState(25565);
  const [settings, setSettings] = useState<IServerSettings | null>(null);
  const [lanAddress, setLanAddress] = useState<string | null>(null);
  const [live, setLive] = useState<ServerPingState | null>(null);
  const [uptime, setUptime] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [statusToken, setStatusToken] = useState(0);
  const [runError, setRunError] = useState<string | null>(null);
  const [isRepairing, setIsRepairing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!version?.versionPath) return;

      const next = await api.path.join(version.versionPath, "server");
      if (cancelled) return;
      setServerPath(next);

      const logoPath = await api.path.join(next, "server-icon.png");
      if (await api.fs.pathExists(logoPath)) {
        try {
          const base64 = await api.fs.readFile(logoPath, "base64");
          if (!cancelled) setLogo(`data:image/png;base64,${base64}`);
        } catch {}
      } else if (!cancelled) {
        setLogo("");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [version?.versionPath, server]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const address = await api.server.lanAddress();
      if (!cancelled) setLanAddress(address);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const readSettings = useCallback(async () => {
    if (!serverPath) return;

    const next = await api.server.getSettings(
      await api.path.join(serverPath, "server.properties"),
    );

    setSettings(next);
    if (next) setPort(next.serverPort || 25565);
  }, [serverPath]);

  useEffect(() => {
    void readSettings();
  }, [readSettings]);

  useEffect(() => {
    if (!runtime || !serverPath) return;

    let cancelled = false;

    void runtime.runStatus(serverPath).then((status) => {
      if (cancelled || !status) return;
      setRunState(status.state);
      setLog(status.log ?? []);
      setStartedAt(status.startedAt ?? null);
      setUptime(status.startedAt ? Date.now() - status.startedAt : 0);
    });

    const offState = runtime.onRunState((payload) => {
      if (!samePath(payload.serverPath, serverPath)) return;
      setRunState(payload.state);
      setStartedAt(payload.startedAt ?? null);

      if (payload.state === "stopped") {
        setUptime(0);
        setLive(null);
      } else {
        setRunError(null);
      }
    });

    const offOutput = runtime.onRunOutput((payload) => {
      if (!samePath(payload.serverPath, serverPath)) return;
      setLog((prev) => [...prev, ...payload.lines].slice(-MAX_LOG_LINES));
    });

    return () => {
      cancelled = true;
      offState();
      offOutput();
    };
  }, [runtime, serverPath, statusToken]);

  useEffect(() => {
    if (runState === "stopped" || startedAt === null) return;

    setUptime(Date.now() - startedAt);
    const handle = setInterval(() => {
      setUptime(Date.now() - startedAt);
    }, 1000);

    return () => clearInterval(handle);
  }, [runState, startedAt]);

  useEffect(() => {
    if (runState !== "running") return;

    let cancelled = false;

    const probe = async () => {
      const result = await api.servers.ping(`127.0.0.1:${port}`);
      if (!cancelled) setLive(toPingState(result));
    };

    void probe();
    const handle = setInterval(() => void probe(), 10000);

    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [runState, port]);

  const control = useCallback(
    async (action: "start" | "stop" | "force") => {
      if (!runtime || !serverPath) return;

      setIsBusy(true);

      try {
        const result =
          action === "start"
            ? await runtime.start(serverPath)
            : await runtime.stop(serverPath, action === "force");

        if (result?.ok) {
          setRunError(null);
          return;
        }

        const code = result?.error ?? "";
        const key = RUN_ERROR_KEYS[code];

        if (action === "start" && REPAIRABLE_ERRORS.has(code)) {
          setRunError(code);
          setView("console");
        }

        showFailureToast(t("serverManager.runError"), result?.error, {
          channels: ["server:start", "server:stop"],
          fallbackDescription: key ? t(key) : undefined,
        });
      } catch (error) {
        showFailureToast(t("serverManager.runError"), error);
      } finally {
        setIsBusy(false);
      }
    },
    [runtime, serverPath, t],
  );

  const repair = useCallback(async () => {
    if (!version || !server || !account) return;

    setIsRepairing(true);

    try {
      await new ServerGame(
        account,
        appSettings.downloadLimit,
        version.versionPath,
        serverPath,
        server,
        version.version,
      ).install();

      setRunError(null);
      setStatusToken((value) => value + 1);
      void readSettings();
      toast.success(t("serverManager.repaired"));
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === VERSION_INSTALL_CANCELLED
      ) {
        return;
      }

      showFailureToast(t("serverManager.repairError"), error, {
        channels: ["server:install"],
      });
    } finally {
      setIsRepairing(false);
    }
  }, [
    version,
    server,
    account,
    appSettings.downloadLimit,
    serverPath,
    readSettings,
    t,
  ]);

  const sendCommand = useCallback(
    async (command: string) => {
      const result = await api.server.command(serverPath, command);
      if (result?.ok) return;

      const key = RUN_ERROR_KEYS[result?.error ?? ""];
      showFailureToast(t("serverManager.commandError"), result?.error, {
        channels: ["server:command"],
        fallbackDescription: key ? t(key) : result?.error,
      });
    },
    [serverPath, t],
  );

  const remove = useCallback(async () => {
    setIsDeleting(true);

    try {
      if (!(await api.shell.trashItem(serverPath))) {
        throw new Error("server folder was not moved to the trash");
      }

      toast.success(t("serverManager.deleted"));
      onDelete();
    } catch (error) {
      showFailureToast(t("serverManager.deleteError"), error, {
        channels: ["shell:trashItem"],
        fallbackDescription: t("serverManager.deleteErrorHint"),
      });
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  }, [serverPath, onDelete, t]);

  const changeLogo = useCallback(
    async (blob: Blob) => {
      const base64 = toBase64(await blob.arrayBuffer());
      const iconPath = await api.path.join(serverPath, "server-icon.png");

      if (!(await api.fs.writeFile(iconPath, base64, "base64"))) {
        showFailureToast(t("serverManager.logoEditError"), undefined, {
          channels: ["fs:writeFile"],
        });
        return false;
      }

      setLogo(`data:image/png;base64,${base64}`);
      setIsCropping(false);
      toast.success(t("serverManager.logoEdited"));
      return true;
    },
    [serverPath, t],
  );

  const copy = useCallback(
    async (value: string) => {
      if (!(await copyToClipboard(value))) return;
      toast.success(t("common.copied"));
    },
    [t],
  );

  if (!server) {
    return (
      <Alert variant="warning">
        <TriangleAlert />
        <AlertTitle>{t("serverManager.configNotFound")}</AlertTitle>
      </Alert>
    );
  }

  const isRunning = runState !== "stopped";
  const isForeign = isRunning && startedAt === null;
  const canRepair = !isRunning && runError !== null;
  const stateLabel = {
    stopped: t("serverManager.stateStopped"),
    starting: t("serverManager.stateStarting"),
    running: t("serverManager.stateRunning"),
    stopping: t("serverManager.stateStopping"),
  }[runState];

  const addresses: { label: string; value: string }[] = [
    { label: t("serverManager.addressLocal"), value: `127.0.0.1:${port}` },
  ];
  if (lanAddress) {
    addresses.push({
      label: t("serverManager.addressLan"),
      value: `${lanAddress}:${port}`,
    });
  }

  const identity: { icon: typeof Cpu; value: string }[] = [
    { icon: Cpu, value: server.core },
    { icon: Coffee, value: `Java ${server.javaMajorVersion}` },
    { icon: MemoryStick, value: `${server.memory} ${t("settings.mb")}` },
  ];

  const facts = settings
    ? [
        {
          label: t("serverSettings.gameMode"),
          value: GAME_MODES.includes(settings.gameMode)
            ? t(
                `serverSettings.gameModes.${GAME_MODES.indexOf(settings.gameMode)}`,
              )
            : settings.gameMode,
        },
        {
          label: t("serverSettings.difficulty"),
          value: DIFFICULTIES.includes(settings.difficulty)
            ? t(
                `serverSettings.difficulties.${DIFFICULTIES.indexOf(settings.difficulty)}`,
              )
            : settings.difficulty,
        },
        {
          label: t("serverSettings.maxPlayers"),
          value: String(settings.maxPlayers),
        },
        {
          label: t("serverSettings.whitelist"),
          value: settings.whitelist ? t("common.yes") : t("common.no"),
        },
      ]
    : [];

  return (
    <>
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
        <header className="flex shrink-0 items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
          <Hint content={logo ? t("common.delete") : t("common.logo")}>
            <button
              type="button"
              aria-label={logo ? t("common.delete") : t("common.logo")}
              onClick={async () => {
                if (logo) {
                  const removed = await api.fs.rimraf(
                    await api.path.join(serverPath, "server-icon.png"),
                  );

                  if (!removed) {
                    showFailureToast(t("serverManager.logoEditError"), undefined, {
                      channels: ["fs:rimraf"],
                    });
                    return;
                  }

                  setLogo("");
                  return;
                }

                const files = await api.other.openFileDialog();
                if (!files?.length) return;
                setCropImage(files[0]);
                setIsCropping(true);
              }}
              className="group relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-3 text-faint transition-colors hover:bg-surface-3/70"
            >
              {logo ? (
                <>
                  <ServerFavicon icon={logo} size={44} />
                  <span className="absolute inset-0 flex items-center justify-center bg-background/70 opacity-0 transition-opacity group-hover:opacity-100">
                    <X className="size-4" />
                  </span>
                </>
              ) : (
                <ImagePlus className="size-4" />
              )}
            </button>
          </Hint>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <StatusDot
                state={
                  runState === "running"
                    ? "online"
                    : runState === "stopped"
                      ? "offline"
                      : "pending"
                }
              />
              <span className="truncate text-sm font-medium">{stateLabel}</span>
              {isRunning && startedAt !== null && (
                <span className="font-mono text-xs text-faint tabular-nums">
                  {formatUptime(uptime)}
                </span>
              )}
              {live?.result?.players && (
                <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground tabular-nums">
                  <Users className="size-3" />
                  {live.result.players.online}/{live.result.players.max}
                </span>
              )}
            </div>
            <div className="flex min-w-0 items-center gap-2 text-[0.7rem] text-faint">
              {identity.map((fact) => {
                const Icon = fact.icon;
                return (
                  <span key={fact.value} className="flex items-center gap-1">
                    <Icon className="size-3" />
                    <span className="truncate">{fact.value}</span>
                  </span>
                );
              })}
            </div>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-lg bg-surface-1 p-0.5">
              {(["console", "settings"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-xs transition-colors",
                    view === value
                      ? "bg-surface-3 text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`serverManager.view.${value}`)}
                </button>
              ))}
            </div>

            {runtime && runState === "stopping" && (
              <Hint content={t("serverManager.forceStopHint")}>
                <Button
                  size="sm"
                  className="h-9"
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => void control("force")}
                >
                  <Zap className="size-4" />
                  {t("serverManager.forceStop")}
                </Button>
              </Hint>
            )}

            {runtime && (
              <Hint
                content={
                  isForeign ? t("serverManager.runErrorNotManaged") : undefined
                }
              >
                <Button
                  size="sm"
                  className="h-9 min-w-36"
                  variant="secondary"
                  disabled={isBusy || runState === "stopping" || isForeign}
                  onClick={() => void control(isRunning ? "stop" : "start")}
                >
                  {isBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : isRunning ? (
                    <Square className="size-4" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  {isRunning
                    ? t("serverManager.stop")
                    : t("serverManager.start")}
                </Button>
              </Hint>
            )}
          </div>
        </header>

        {view === "settings" && serverPath ? (
          <ServerSettingsPanel
            serverPath={serverPath}
            conf={server}
            runningPort={isRunning ? port : undefined}
            resourcePacks={
              version?.version.loader.mods.filter(
                (project) => project.projectType === ProjectType.RESOURCEPACK,
              ) ?? []
            }
            onSaved={(next) => {
              setServer(next);
              void readSettings();
            }}
          />
        ) : (
          <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_19rem] gap-3">
            <ServerConsole
              lines={log}
              canSend={runState === "running" && !isForeign}
              onSend={sendCommand}
            />

            <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
                <div className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("serverManager.share")}
                  </span>
                  {addresses.map((entry) => (
                    <button
                      key={entry.label}
                      type="button"
                      onClick={() => void copy(entry.value)}
                      className="group flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1 text-left transition-colors hover:bg-accent/40"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.65rem] text-faint">
                          {entry.label}
                        </span>
                        <span className="block truncate font-mono text-xs">
                          {entry.value}
                        </span>
                      </span>
                      <Copy className="size-3 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  ))}
                  <p className="text-[0.65rem] text-faint">
                    {t("serverManager.shareHint")}
                  </p>
                </div>

                {(live?.result?.descriptionRaw || settings?.motd) && (
                  <div className="grid gap-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("serverSettings.description")}
                    </span>
                    <MotdText
                      spans={parseMotd(
                        live?.result?.descriptionRaw ?? settings?.motd,
                      )}
                      lines={2}
                      className="text-xs leading-4"
                    />
                  </div>
                )}

                {!settings && (
                  <div className="grid gap-1.5 rounded-lg border border-warning/40 bg-surface-2 px-2.5 py-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-warning">
                      <TriangleAlert className="size-3.5 shrink-0" />
                      {t("serverManager.settingsUnreadable")}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 justify-self-start px-2 text-[0.7rem]"
                      onClick={() => void readSettings()}
                    >
                      <RefreshCw className="size-3" />
                      {t("common.retry")}
                    </Button>
                  </div>
                )}

                {settings && (
                  <div className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("serverSettings.sections.game")}
                    </span>
                    <div className="grid gap-px overflow-hidden rounded-lg border bg-border">
                      {facts.map((fact) => (
                        <div
                          key={fact.label}
                          className="flex items-center justify-between gap-2 bg-card px-2.5 py-1"
                        >
                          <span className="truncate text-[0.7rem] text-muted-foreground">
                            {fact.label}
                          </span>
                          <span className="min-w-0 truncate text-[0.7rem]">
                            {fact.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {live?.result?.players?.sample?.length ? (
                  <div className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("servers.playersOnline")}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {live.result.players.sample.slice(0, 10).map((player) => (
                        <span
                          key={player.name}
                          className="max-w-full truncate rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[0.7rem]"
                        >
                          {stripMotd(player.name)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {canRepair && (
                  <div className="grid gap-1.5 rounded-lg border border-destructive/40 bg-surface-2 px-2.5 py-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                      <TriangleAlert className="size-3.5 shrink-0" />
                      {t("serverManager.repairTitle")}
                    </span>
                    <p className="text-[0.7rem] leading-snug text-muted-foreground">
                      {t("serverManager.repairHint")}
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 justify-self-start px-2 text-[0.7rem]"
                      disabled={
                        isRepairing || isRunning || isInstallActive || !account
                      }
                      onClick={() => void repair()}
                    >
                      {isRepairing ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <HardDriveDownload className="size-3" />
                      )}
                      {t("serverManager.repair")}
                    </Button>
                  </div>
                )}

                {isForeign && (
                  <div className="grid gap-1.5 rounded-lg border border-warning/40 bg-surface-2 px-2.5 py-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-warning">
                      <TriangleAlert className="size-3.5 shrink-0" />
                      {t("serverManager.foreignTitle")}
                    </span>
                    <p className="text-[0.7rem] leading-snug text-muted-foreground">
                      {t("serverManager.foreignHint")}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 justify-self-start px-2 text-[0.7rem]"
                      onClick={() => setStatusToken((value) => value + 1)}
                    >
                      <RefreshCw className="size-3" />
                      {t("servers.recheck")}
                    </Button>
                  </div>
                )}

                {!runtime && (
                  <p className="rounded-lg border border-warning/40 bg-surface-2 px-2.5 py-2 text-[0.7rem] text-warning">
                    {t("serverManager.runtimeMissing")}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2 border-t bg-surface-1 px-3 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 justify-start"
                  onClick={() => void api.shell.openPath(serverPath)}
                >
                  <FolderOpen className="size-3.5" />
                  {t("common.openFolder")}
                </Button>
                <Hint content={t("common.delete")}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    disabled={isRunning || isDeleting}
                    aria-label={t("common.delete")}
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash className="size-3.5" />
                  </Button>
                </Hint>
              </div>
            </aside>
          </div>
        )}
      </div>

      {isCropping && (
        <ImageCropper
          title={t("common.editingLogo")}
          image={cropImage}
          onClose={() => setIsCropping(false)}
          size={{ height: 64, width: 64 }}
          changeImageBlob={changeLogo}
        />
      )}

      {confirmDelete && (
        <Confirmation
          title={t("serverManager.deleteTitle")}
          reversible
          content={[{ text: t("serverManager.confirmation") }]}
          buttons={[
            {
              text: t("common.delete"),
              color: "danger",
              loading: isDeleting,
              onClick: () => void remove(),
            },
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setConfirmDelete(false),
            },
          ]}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
