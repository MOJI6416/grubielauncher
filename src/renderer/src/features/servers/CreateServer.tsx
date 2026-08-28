import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Hint } from "@renderer/components/Hint";
import { FactRow, FactRows } from "@renderer/components/FactRows";
import { IServerConf, IServerOption } from "@/types/Server";
import { mcVersionToJavaMajor } from "@/shared/javaVersions";
import {
  accountAtom,
  installActiveAtom,
  selectedVersionAtom,
  serverAtom,
  settingsAtom,
} from "@renderer/stores/atoms";
import { useAtom, useSetAtom } from "jotai";
import {
  ArrowLeft,
  Boxes,
  Copy,
  FileCheck2,
  FolderPlus,
  HardDriveDownload,
  Loader2,
  RotateCcw,
  ServerCog,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ServerGame } from "@renderer/classes/ServerGame";
import { Mods } from "@renderer/classes/Mods";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { LoaderLabel } from "@renderer/components/Loaders";
import {
  SERVER_MEMORY_MIN,
  SERVER_MEMORY_STEP,
  clampServerMemory,
  recommendedServerMemory,
  serverMemoryLimit,
} from "@renderer/features/instances/serverMemory";
import { classifyError } from "@/shared/errors";
import { VERSION_INSTALL_CANCELLED } from "@/types/InstallationProgress";
import { describeFailure } from "@renderer/utilities/failures";
import { toast } from "sonner";
import { copyToClipboard } from "@renderer/utilities/clipboard";

const api = window.api;

async function canDiscardServerFolder(serverPath: string) {
  const entries = await api.fs.readdir(serverPath);
  if (!entries || entries.length === 0) return false;

  for (const entry of entries) {
    const levelPath = await api.path.join(serverPath, entry, "level.dat");
    if (await api.fs.pathExists(levelPath)) return false;
  }

  return true;
}

async function discardIncompleteServer(versionPath: string) {
  try {
    const serverPath = await api.path.join(versionPath, "server");
    const confPath = await api.path.join(serverPath, "conf.json");
    if (await api.fs.pathExists(confPath)) return false;
    if (!(await api.fs.pathExists(serverPath))) return false;
    if (!(await canDiscardServerFolder(serverPath))) return false;

    return await api.fs.rimraf(serverPath);
  } catch {
    return false;
  }
}

export function CreateServer({
  close,
  serverCores,
}: {
  close: (isSuccess?: boolean) => void;
  serverCores: IServerOption[];
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<"setup" | "confirm">("setup");
  const [eulaAccepted, setEulaAccepted] = useState(false);
  const [error, setError] = useState<{
    text: string;
    technical: string;
    cleaned: boolean;
  } | null>(null);
  const [selectedVersion] = useAtom(selectedVersionAtom);
  const [account] = useAtom(accountAtom);
  const { t } = useTranslation();
  const setServer = useSetAtom(serverAtom);
  const [settings] = useAtom(settingsAtom);
  const [isInstallActive] = useAtom(installActiveAtom);
  const [progressStarted, setProgressStarted] = useState(false);

  const [selectedCore, setSelectedCore] = useState<string | null>(
    serverCores[0]?.core ?? null,
  );
  const [totalMemory, setTotalMemory] = useState(0);

  const modCount = selectedVersion?.version.loader.mods?.length ?? 0;
  const recommended = recommendedServerMemory(modCount);
  const memoryMax = serverMemoryLimit(totalMemory);

  const [memory, setMemory] = useState(() =>
    clampServerMemory(recommended, serverMemoryLimit(0)),
  );

  useEffect(() => {
    let cancelled = false;

    void api.os.totalmem().then((total) => {
      if (cancelled) return;

      const totalMb = Math.floor(total / (1024 * 1024));
      setTotalMemory(totalMb);
      setMemory((current) =>
        clampServerMemory(current, serverMemoryLimit(totalMb)),
      );
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const javaMajor =
    selectedVersion &&
    (selectedVersion.javaMajorVersion ??
      mcVersionToJavaMajor(selectedVersion.version.version.id));

  const selectedServerCore = useMemo(() => {
    return selectedCore
      ? serverCores.find((sc) => sc.core === selectedCore)
      : undefined;
  }, [selectedCore, serverCores]);

  const coreHost = useMemo(() => {
    if (!selectedServerCore?.url) return "";

    try {
      return new URL(selectedServerCore.url).hostname;
    } catch {
      return "";
    }
  }, [selectedServerCore?.url]);

  const serverPath = useMemo(() => {
    const versionPath = selectedVersion?.versionPath;
    return versionPath ? api.path.join(versionPath, "server") : "";
  }, [selectedVersion?.versionPath]);

  useEffect(() => {
    if (!selectedCore && serverCores.length) {
      setSelectedCore(serverCores[0].core);
    }
  }, [serverCores, selectedCore]);

  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoading) setProgressStarted(false);
    else if (isInstallActive) setProgressStarted(true);
  }, [isLoading, isInstallActive]);

  const canInstall =
    !!selectedVersion && !!selectedServerCore && !!account && eulaAccepted;

  const blockedReason = isLoading
    ? t("versions.serverBlocked.installing")
    : isInstallActive
      ? t("versions.installBusy")
      : !selectedServerCore
        ? t("versions.notFoundServerCore")
        : !eulaAccepted
          ? t("versions.serverSetup.eulaRequired")
          : undefined;

  const handleInstall = useCallback(async () => {
    if (isLoading || isInstallActive) return;
    if (!selectedVersion || !selectedServerCore || !account) return;

    const versionPath = selectedVersion.versionPath;

    setError(null);
    setIsLoading(true);

    let success = false;

    try {
      const serverPath = await api.path.join(versionPath, "server");
      await api.fs.ensure(serverPath);

      const conf: IServerConf = {
        core: selectedServerCore.core,
        javaMajorVersion:
          selectedVersion.javaMajorVersion ??
          mcVersionToJavaMajor(selectedVersion.version.version.id),
        memory,
        downloads: {
          server: selectedServerCore.url,
        },
      };

      const serverGame = new ServerGame(
        account,
        settings.downloadLimit,
        versionPath,
        serverPath,
        conf,
        selectedVersion.version,
      );

      const hasMods = selectedVersion.version.loader.mods.length > 0;

      await serverGame.install({ keepProgressOpen: hasMods });

      if (
        !(await api.fs.writeJSON(
          await api.path.join(serverPath, "conf.json"),
          conf,
        ))
      ) {
        throw new Error("server conf.json was not written");
      }

      setServer(conf);

      if (
        !(await api.fs.writeFile(
          await api.path.join(serverPath, "eula.txt"),
          "eula=true",
          "utf-8",
        ))
      ) {
        throw new Error("server eula.txt was not written");
      }

      if (hasMods) {
        const mods = new Mods(settings, selectedVersion.version, conf);
        await mods.check({ operation: "server" });
      }

      toast.success(t("versions.serverInstalled"));

      success = true;
    } catch (err) {
      const cancelled =
        err instanceof Error && err.message === VERSION_INSTALL_CANCELLED;

      if (cancelled) {
        await discardIncompleteServer(versionPath);
        if (isMountedRef.current) {
          setIsLoading(false);
          close();
        }
        return;
      }

      const info = classifyError(err, { channel: "server:install" });
      const described = describeFailure(info);

      const text =
        info.cause === "unknown"
          ? info.message || t("versions.serverInstallError")
          : [described.reason, described.hint].filter(Boolean).join(" ");

      const cleaned = await discardIncompleteServer(versionPath);

      if (isMountedRef.current) {
        setError({
          text: text || t("versions.serverInstallError"),
          technical: [described.technical, `${t("errors.code")}: ${info.code}`]
            .filter(Boolean)
            .join("\n"),
          cleaned,
        });
      }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }

    if (success) close(true);
  }, [
    isLoading,
    isInstallActive,
    selectedVersion,
    selectedServerCore,
    account,
    settings.downloadLimit,
    setServer,
    close,
    t,
    settings,
    memory,
  ]);

  const facts = selectedVersion
    ? [
        {
          id: "instance",
          label: t("versions.name"),
          value: (
            <span className="truncate">{selectedVersion.version.name}</span>
          ),
        },
        {
          id: "version",
          label: t("versions.version"),
          value: (
            <span className="flex items-center gap-2">
              <LoaderLabel loader={selectedVersion.version.loader.name} />
              <span className="font-mono">
                {selectedVersion.version.version.id}
              </span>
            </span>
          ),
        },
        {
          id: "content",
          label: t("addVersion.preview.content"),
          value: <span className="font-mono tabular-nums">{modCount}</span>,
        },
        {
          id: "java",
          label: t("versions.facts.java"),
          value: (
            <span className="font-mono">
              {javaMajor ? `Java ${javaMajor}` : "—"}
            </span>
          ),
        },
        ...(step === "confirm"
          ? [
              {
                id: "core",
                label: t("versions.serverCore"),
                value: (
                  <span className="truncate font-mono">
                    {selectedServerCore?.core ?? "—"}
                  </span>
                ),
              },
              {
                id: "memory",
                label: t("settings.memory"),
                value: (
                  <span className="font-mono tabular-nums">
                    {memory} {t("settings.mb")}
                  </span>
                ),
              },
            ]
          : []),
      ]
    : [];

  const effects = [
    {
      id: "folder",
      icon: FolderPlus,
      text: t("versions.serverSetup.effectFolder"),
      detail: serverPath,
    },
    {
      id: "core",
      icon: HardDriveDownload,
      text: t("versions.serverSetup.effectCore", {
        core: selectedServerCore?.core ?? "",
      }),
      detail: coreHost,
    },
    ...(modCount > 0
      ? [
          {
            id: "mods",
            icon: Boxes,
            text: t("versions.serverSetup.effectMods", { count: modCount }),
            detail: "",
          },
        ]
      : []),
    {
      id: "eula",
      icon: FileCheck2,
      text: t("versions.serverSetup.effectEula"),
      detail: "",
    },
  ];

  return (
    <Dialog
      open={!(isLoading && progressStarted)}
      onOpenChange={(open) => {
        if (!open && !isLoading) close();
      }}
    >
      <DialogContent
        className="gap-3 sm:max-w-md"
        onPointerDownOutside={(event) => {
          if (isLoading) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isLoading) event.preventDefault();
        }}
      >
        <DialogHeader className="min-w-0 gap-1.5">
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <ServerCog className="size-5 shrink-0" />
            <span className="truncate">{t("versions.createingServer")}</span>
          </DialogTitle>
          <DialogDescription className="text-xs leading-snug">
            {step === "confirm"
              ? t("versions.serverSetup.confirmLead")
              : t("versions.serverSetup.description")}
          </DialogDescription>
        </DialogHeader>

        <FactRows surface="dialog" framed>
          {facts.map((fact) => (
            <FactRow key={fact.id} label={fact.label} value={fact.value} />
          ))}
        </FactRows>

        {step === "confirm" ? (
          <ul className="grid divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-card">
            {effects.map((effect) => (
              <li key={effect.id} className="flex items-start gap-2 px-2.5 py-2">
                <effect.icon className="mt-0.5 size-3.5 shrink-0 text-faint" />
                <span className="grid min-w-0 gap-0.5">
                  <span className="text-xs leading-snug">{effect.text}</span>
                  {effect.detail && (
                    <Hint content={effect.detail} variant="text" truncatedOnly>
                      <span className="truncate font-mono text-[0.68rem] text-faint">
                        {effect.detail}
                      </span>
                    </Hint>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : serverCores.length > 0 ? (
          <div className="grid gap-1.5">
            <Label htmlFor="server-core" className="text-xs">
              {t("versions.serverCore")}
            </Label>
            <Select
              value={selectedCore ?? serverCores[0]?.core ?? ""}
              disabled={isLoading}
              onValueChange={(value) => setSelectedCore(value || null)}
            >
              <SelectTrigger id="server-core" size="sm" className="w-full">
                <SelectValue placeholder={t("versions.serverCore")} />
              </SelectTrigger>
              <SelectContent>
                {serverCores.map((sc) => (
                  <SelectItem key={sc.core} value={sc.core}>
                    {sc.core}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[0.7rem] leading-snug text-faint">
              {t("versions.serverSetup.coreHint")}
            </p>
          </div>
        ) : (
          <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-surface-2 p-2.5 text-xs">
            <TriangleAlert className="mt-px size-3.5 shrink-0 text-destructive" />
            <span className="min-w-0">{t("versions.notFoundServerCore")}</span>
          </p>
        )}

        {step === "setup" && (
          <>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <Label className="text-xs">{t("settings.memory")}</Label>
                <span className="font-mono text-xs tabular-nums text-foreground">
                  {memory} {t("settings.mb")}
                </span>
              </div>
              <Slider
                step={SERVER_MEMORY_STEP}
                min={SERVER_MEMORY_MIN}
                max={memoryMax}
                value={[memory]}
                disabled={isLoading}
                onValueChange={([value]) => {
                  if (typeof value === "number") setMemory(value);
                }}
              />
              <p className="text-[0.7rem] leading-snug text-faint">
                {totalMemory
                  ? t("versions.serverSetup.memoryHint", {
                      recommended,
                      total: totalMemory,
                    })
                  : t("versions.serverSetup.memoryHintShort", { recommended })}
              </p>
            </div>

            <label className="flex items-start gap-2.5 text-xs">
              <Checkbox
                checked={eulaAccepted}
                disabled={isLoading}
                onCheckedChange={(checked) => setEulaAccepted(checked === true)}
                className="mt-px"
              />
              <span className="min-w-0 leading-snug text-muted-foreground">
                {t("versions.eulaLabel")}{" "}
                <button
                  type="button"
                  className="text-foreground underline underline-offset-2"
                  onClick={(event) => {
                    event.preventDefault();
                    void api.shell.openExternal(
                      "https://www.minecraft.net/eula",
                    );
                  }}
                >
                  {t("versions.eulaLink")}
                </button>
              </span>
            </label>
          </>
        )}

        {error ? (
          <div
            role="alert"
            className="grid gap-2 rounded-lg border border-destructive/40 bg-surface-2 p-2.5 text-xs"
          >
            <p className="flex items-start gap-2">
              <TriangleAlert className="mt-px size-3.5 shrink-0 text-destructive" />
              <span className="min-w-0 leading-snug break-words">
                {error.text}
              </span>
            </p>
            <div className="flex items-center justify-between gap-2 pl-6">
              <span className="min-w-0 truncate text-[0.68rem] text-faint">
                {error.cleaned ? t("versions.serverSetup.cleanedUp") : ""}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 shrink-0 px-2 text-[0.7rem]"
                onClick={async () => {
                  const copied = await copyToClipboard(
                    [error.text, error.technical].filter(Boolean).join("\n"),
                  );
                  if (!copied) return;
                  toast(t("common.copied"));
                }}
              >
                <Copy className="size-3" />
                {t("common.copy")}
              </Button>
            </div>
          </div>
        ) : step === "confirm" ? (
          <p className="flex items-center gap-1.5 text-[0.7rem] text-faint">
            <RotateCcw className="size-3 shrink-0" />
            {t("versions.serverSetup.reversible")}
          </p>
        ) : (
          <p className="text-[0.7rem] leading-snug text-faint">
            {t("versions.serverSetup.afterInstall")}
          </p>
        )}

        <DialogFooter>
          {step === "confirm" ? (
            <>
              <Button
                variant="secondary"
                disabled={isLoading}
                onClick={() => setStep("setup")}
              >
                <ArrowLeft />
                {t("shell.back")}
              </Button>
              <Hint content={blockedReason}>
                <Button
                  disabled={!canInstall || !!blockedReason}
                  onClick={handleInstall}
                >
                  {isLoading ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <HardDriveDownload />
                  )}
                  {t("versions.serverSetup.confirmAction")}
                </Button>
              </Hint>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                disabled={isLoading}
                onClick={() => close()}
              >
                {t("common.cancel")}
              </Button>
              <Hint content={blockedReason}>
                <Button
                  disabled={!canInstall || !!blockedReason}
                  onClick={() => setStep("confirm")}
                >
                  {t("versions.serverSetup.continue")}
                </Button>
              </Hint>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
