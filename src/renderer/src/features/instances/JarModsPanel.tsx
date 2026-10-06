import { ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowUp,
  FileArchive,
  FileX,
  Info,
  Loader2,
  Lock,
  Plus,
  Replace,
  Trash2,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import type { IJarMod } from "@/types/IVersion";
import { JAR_MOD_EXTENSIONS } from "@/shared/jarMods";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Version } from "@renderer/classes/Version";
import { Hint } from "@renderer/components/Hint";
import {
  reportIpcFailure,
  showFailureToast,
} from "@renderer/utilities/failures";
import { SectionCard } from "./SectionCard";
import { bumpInstanceDataRevision } from "./instanceRevision";
import { moveJarMod, setJarModEnabled, withoutJarMod } from "./jarMods";

const api = window.api;

type Busy = "mods" | "base" | null;

function Note({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-2 text-xs leading-snug text-muted-foreground">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-faint" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function IconAction({
  label,
  icon: Icon,
  disabled,
  tone,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  tone?: "destructive";
  onClick: () => void;
}) {
  return (
    <Hint content={label}>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label={label}
        disabled={disabled}
        className={cn(
          "text-faint",
          tone === "destructive" && "hover:text-destructive",
        )}
        onClick={onClick}
      >
        <Icon />
      </Button>
    </Hint>
  );
}

export function JarModsPanel({
  instance,
  lockedReason,
  onClose,
}: {
  instance: Version;
  lockedReason?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const conf = instance.version;

  const [mods, setMods] = useState<IJarMod[]>(() => conf.jarMods ?? []);
  const [mainJar, setMainJar] = useState<IJarMod | undefined>(
    () => conf.mainJar,
  );
  const [present, setPresent] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [filesRevision, setFilesRevision] = useState(0);

  const isLocked = !!lockedReason || busy !== null;

  useEffect(() => {
    let cancelled = false;

    void api.version.jarModFiles(instance.versionPath).then((files) => {
      if (!cancelled) setPresent(new Set(files));
    });

    return () => {
      cancelled = true;
    };
  }, [instance.versionPath, filesRevision]);

  const isMissing = (mod: IJarMod) => !!present && !present.has(mod.file);

  async function persist(nextMods: IJarMod[], nextMain: IJarMod | undefined) {
    const previousMods = conf.jarMods;
    const previousMain = conf.mainJar;

    conf.jarMods = nextMods.length > 0 ? nextMods : undefined;
    conf.mainJar = nextMain;
    setMods(nextMods);
    setMainJar(nextMain);

    if (await instance.save()) {
      bumpInstanceDataRevision();
      return true;
    }

    conf.jarMods = previousMods;
    conf.mainJar = previousMain;
    setMods(previousMods ?? []);
    setMainJar(previousMain);

    if (!reportIpcFailure(t("jarMods.saveFailed"), ["version:save"])) {
      showFailureToast(t("jarMods.saveFailed"), undefined, {
        channels: ["version:save"],
      });
    }
    return false;
  }

  async function discardFile(file: string) {
    await api.version.removeJarMod(instance.versionPath, file);
    setFilesRevision((value) => value + 1);
  }

  async function importFiles(multi: boolean) {
    const filePaths = await api.other.openFileDialog(
      false,
      [{ name: t("jarMods.fileFilter"), extensions: JAR_MOD_EXTENSIONS }],
      multi,
    );
    if (!filePaths?.length) return null;

    const imported = await api.version.importJarMods(
      instance.versionPath,
      filePaths,
    );
    setFilesRevision((value) => value + 1);

    if (!imported) {
      showFailureToast(t("jarMods.importFailed"), undefined, {
        channels: ["version:importJarMods"],
      });
      return null;
    }

    return imported;
  }

  async function run(kind: Exclude<Busy, null>, task: () => Promise<void>) {
    setBusy(kind);
    try {
      await task();
    } finally {
      setBusy(null);
    }
  }

  const addMods = () =>
    run("mods", async () => {
      const imported = await importFiles(true);
      if (imported) await persist([...mods, ...imported], mainJar);
    });

  const replaceBase = () =>
    run("base", async () => {
      const imported = await importFiles(false);
      if (!imported?.[0]) return;

      const previous = mainJar;
      if ((await persist(mods, imported[0])) && previous) {
        await discardFile(previous.file);
      }
    });

  const restoreVanilla = () =>
    run("base", async () => {
      const previous = mainJar;
      if (previous && (await persist(mods, undefined))) {
        await discardFile(previous.file);
      }
    });

  const removeMod = (mod: IJarMod) =>
    run("mods", async () => {
      if (await persist(withoutJarMod(mods, mod.file), mainJar)) {
        await discardFile(mod.file);
      }
    });

  const activeCount = mods.filter((mod) => mod.enabled).length;
  const baseTitle = mainJar
    ? mainJar.name
    : t("jarMods.base.vanillaTitle", { version: conf.version.id });

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex h-7 shrink-0 items-center gap-2">
        <FileArchive className="size-3.5 shrink-0 text-faint" />
        <span className="min-w-0 flex-1 truncate text-[0.68rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          {t("jarMods.title")}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[0.7rem] text-faint"
          onClick={onClose}
        >
          <X />
          {t("common.close")}
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,320px)] grid-rows-[minmax(0,1fr)] gap-3">
        <SectionCard
          title={t("jarMods.list.title")}
          icon={FileArchive}
          action={
            <>
              {mods.length > 0 && (
                <span className="shrink-0 font-mono text-[0.7rem] tabular-nums text-faint">
                  {activeCount}/{mods.length}
                </span>
              )}
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={isLocked}
                onClick={() => void addMods()}
              >
                {busy === "mods" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Plus />
                )}
                {t("jarMods.list.add")}
              </Button>
            </>
          }
          bodyClassName="overflow-y-auto p-1.5"
        >
          {mods.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <FileArchive className="size-6 text-faint" />
              <p className="max-w-80 text-xs leading-snug text-muted-foreground">
                {t("jarMods.list.empty")}
              </p>
            </div>
          ) : (
            <ol className="grid gap-px">
              {mods.map((mod, index) => (
                <li
                  key={mod.file}
                  className="flex h-10 min-w-0 items-center gap-2.5 rounded-md px-2 transition-colors hover:bg-surface-2"
                >
                  <span className="w-5 shrink-0 text-right font-mono text-[0.7rem] tabular-nums text-faint">
                    {index + 1}
                  </span>
                  <Switch
                    size="sm"
                    checked={mod.enabled}
                    disabled={isLocked}
                    aria-label={mod.name}
                    onCheckedChange={(enabled) =>
                      void run("mods", async () => {
                        await persist(
                          setJarModEnabled(mods, mod.file, enabled),
                          mainJar,
                        );
                      })
                    }
                  />
                  <Hint content={mod.name} variant="text" truncatedOnly>
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-sm",
                        !mod.enabled && "text-muted-foreground",
                      )}
                    >
                      {mod.name}
                    </span>
                  </Hint>
                  {isMissing(mod) && (
                    <span className="flex shrink-0 items-center gap-1 text-[0.7rem] text-destructive">
                      <FileX className="size-3" />
                      {t("jarMods.list.missing")}
                    </span>
                  )}
                  <div className="flex shrink-0 items-center">
                    <IconAction
                      label={t("jarMods.list.moveUp")}
                      icon={ArrowUp}
                      disabled={isLocked || index === 0}
                      onClick={() =>
                        void run("mods", async () => {
                          await persist(moveJarMod(mods, index, -1), mainJar);
                        })
                      }
                    />
                    <IconAction
                      label={t("jarMods.list.moveDown")}
                      icon={ArrowDown}
                      disabled={isLocked || index === mods.length - 1}
                      onClick={() =>
                        void run("mods", async () => {
                          await persist(moveJarMod(mods, index, 1), mainJar);
                        })
                      }
                    />
                    <IconAction
                      label={t("jarMods.list.remove")}
                      icon={Trash2}
                      tone="destructive"
                      disabled={isLocked}
                      onClick={() => void removeMod(mod)}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>

        <div className="flex min-h-0 flex-col gap-3">
          <SectionCard
            title={t("jarMods.base.title")}
            icon={Replace}
            className="shrink-0"
            bodyClassName="flex flex-col gap-2.5 p-3"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2">
                {mainJar ? (
                  <Replace
                    className={cn(
                      "size-4",
                      mainJar.enabled ? "text-warning" : "text-faint",
                    )}
                  />
                ) : (
                  <FileArchive className="size-4 text-faint" />
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Hint content={baseTitle} variant="text" truncatedOnly>
                  <span className="min-w-0 truncate text-sm font-medium">
                    {baseTitle}
                  </span>
                </Hint>
                <span className="truncate text-[0.7rem] text-muted-foreground">
                  {mainJar
                    ? isMissing(mainJar)
                      ? t("jarMods.list.missing")
                      : mainJar.enabled
                        ? t("jarMods.base.replacing")
                        : t("jarMods.base.replacementOff")
                    : t("jarMods.base.vanillaHint")}
                </span>
              </div>
              {mainJar && (
                <Switch
                  size="sm"
                  checked={mainJar.enabled}
                  disabled={isLocked}
                  aria-label={mainJar.name}
                  onCheckedChange={(enabled) =>
                    void run("base", async () => {
                      await persist(mods, { ...mainJar, enabled });
                    })
                  }
                />
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-w-0 flex-1"
                disabled={isLocked}
                onClick={() => void replaceBase()}
              >
                {busy === "base" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Replace />
                )}
                <span className="truncate">{t("jarMods.base.replace")}</span>
              </Button>
              {mainJar && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="min-w-0"
                  disabled={isLocked}
                  onClick={() => void restoreVanilla()}
                >
                  <Undo2 />
                  <span className="truncate">{t("jarMods.base.restore")}</span>
                </Button>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title={t("jarMods.notes.title")}
            icon={Info}
            bodyClassName="overflow-y-auto p-3"
          >
            <ul className="grid gap-2">
              <Note icon={ArrowDown}>{t("jarMods.notes.order")}</Note>
              <Note icon={FileArchive}>{t("jarMods.notes.untouched")}</Note>
              <Note icon={Lock}>{t("jarMods.notes.local")}</Note>
            </ul>
          </SectionCard>

          {lockedReason && (
            <p className="flex shrink-0 items-start gap-2 text-xs leading-snug text-warning">
              <Lock className="mt-0.5 size-3 shrink-0" />
              {lockedReason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
