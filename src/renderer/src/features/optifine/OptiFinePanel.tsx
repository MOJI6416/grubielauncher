import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { toast } from "sonner";
import {
  ArrowRight,
  CircleCheck,
  Download,
  FileUp,
  Gauge,
  Globe,
  Info,
  Layers,
  Loader2,
  RotateCw,
  TriangleAlert,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { VERSION_INSTALL_CANCELLED } from "@/types/InstallationProgress";
import {
  type OptiFineChoice,
  forgeFit,
  optifineBuildsFor,
  optifineLabel,
  pickOptiFineBuild,
  toOptiFineChoice,
} from "@/shared/optifine";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Version } from "@renderer/classes/Version";
import { FactRow, FactRows } from "@renderer/components/FactRows";
import { Hint } from "@renderer/components/Hint";
import {
  type PickerItem,
  PickerList,
} from "@renderer/features/newInstance/PickerList";
import { bumpInstanceDataRevision } from "@renderer/features/instances/instanceRevision";
import { countFeature } from "@renderer/features/usage/usage";
import {
  accountAtom,
  installActiveAtom,
  settingsAtom,
} from "@renderer/stores/atoms";
import { showFailureToast } from "@renderer/utilities/failures";
import { showUndoToast } from "@renderer/utilities/undoToast";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { installedOptiFine } from "./OptiFineSettingsRow";
import { useOptiFineBuilds, useOptiFineStored } from "./useOptiFineBuilds";
import { optifineErrorKey, pickOptiFineFile } from "./optifineActions";

const api = window.api;

type Busy = "download" | "install" | "remove" | null;

function Note({
  icon: Icon,
  tone,
  children,
}: {
  icon: LucideIcon;
  tone?: "warning";
  children: ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex items-start gap-2 text-xs leading-snug",
        tone === "warning" ? "text-warning" : "text-muted-foreground",
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

export function OptiFinePanel({
  instance,
  lockedReason,
  onClose,
}: {
  instance: Version;
  lockedReason?: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const conf = instance.version;
  const minecraft = conf.version.id;
  const loader = conf.loader.name;
  const forgeVersion = conf.loader.version?.id;
  const account = useAtomValue(accountAtom);
  const settings = useAtomValue(settingsAtom);
  const installActive = useAtomValue(installActiveAtom);

  const catalog = useOptiFineBuilds(minecraft, true);
  const builds = useMemo(
    () => optifineBuildsFor(catalog.builds, minecraft, loader),
    [catalog.builds, minecraft, loader],
  );

  const [installed, setInstalled] = useState<OptiFineChoice | null>(() =>
    installedOptiFine(conf),
  );
  const [selectedFile, setSelectedFile] = useState<string | undefined>(
    installed?.file,
  );
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [revision, setRevision] = useState(0);
  const pickedByUser = useRef(false);

  useEffect(() => {
    if (pickedByUser.current || installed || builds.length === 0) return;
    setSelectedFile(pickOptiFineBuild(builds, loader, forgeVersion)?.file);
  }, [builds, forgeVersion, installed, loader]);

  const selected = builds.find((build) => build.file === selectedFile);
  const selectedChoice = selected ? toOptiFineChoice(selected) : null;
  const stored = useOptiFineStored(selectedChoice, revision);
  const isCurrent = !!selected && selected.file === installed?.file;
  const fit = selected && loader === "forge" ? forgeFit(selected, forgeVersion) : "ok";

  const blocked =
    lockedReason ??
    (!account
      ? t("optifine.blocked.noAccount")
      : installActive && busy === null
        ? t("optifine.blocked.busy")
        : null);

  const formatDate = (date: string | null) =>
    date
      ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(
          new Date(`${date}T00:00:00`),
        )
      : undefined;

  const needle = query.trim().toLowerCase();
  const items: PickerItem[] = builds
    .filter(
      (build) =>
        !needle || optifineLabel(build.edition).toLowerCase().includes(needle),
    )
    .map((build) => ({
      id: build.file,
      label: optifineLabel(build.edition),
      meta:
        loader === "forge" && forgeFit(build, forgeVersion) === "older"
          ? t("optifine.list.needsForge", { version: build.forge })
          : formatDate(build.date),
      metaTone:
        loader === "forge" && forgeFit(build, forgeVersion) === "older"
          ? ("warning" as const)
          : undefined,
      badge:
        build.file === installed?.file ? t("optifine.list.installed") : undefined,
    }));

  async function apply(
    next: OptiFineChoice | undefined,
    mode: "install" | "remove",
  ): Promise<boolean> {
    if (!account) return false;
    const previous = conf.optifine;
    conf.optifine = next;

    try {
      if (!(await instance.save())) throw new Error("version:save");
      await instance.install(account, settings, [], { operation: "install" });
      setInstalled(installedOptiFine(conf));
      bumpInstanceDataRevision();
      return true;
    } catch (error) {
      conf.optifine = previous;
      await instance.save().catch(ignoreFailure);
      await instance
        .install(account, settings, [], { operation: "install" })
        .catch(ignoreFailure);

      if (error instanceof Error && error.message === VERSION_INSTALL_CANCELLED) {
        toast(t("optifine.toast.cancelled"));
      } else {
        const key = optifineErrorKey(error);
        showFailureToast(
          t(mode === "remove" ? "optifine.toast.removeFailed" : "optifine.toast.failed"),
          error,
          key ? { description: t(key) } : undefined,
        );
      }
      return false;
    }
  }

  async function install(choice: OptiFineChoice) {
    setBusy("install");
    try {
      if (await apply(choice, "install")) {
        countFeature("optifine.install");
        toast.success(
          t("optifine.toast.installed", { edition: optifineLabel(choice.edition) }),
        );
      }
    } finally {
      setBusy(null);
    }
  }

  async function downloadAndInstall() {
    if (!selectedChoice) return;
    setBusy("download");
    let obtained: OptiFineChoice | null = null;
    try {
      obtained = await api.optifine.obtain(selectedChoice);
    } catch (error) {
      showFailureToast(t("optifine.toast.downloadFailed"), error);
      setBusy(null);
      return;
    }
    setRevision((value) => value + 1);

    if (!obtained) {
      setBusy(null);
      toast(t("optifine.toast.closed"));
      return;
    }
    await install(obtained);
  }

  async function installFromFile() {
    setBusy("download");
    let choice: OptiFineChoice | null = null;
    try {
      choice = await pickOptiFineFile(minecraft);
    } finally {
      setBusy(null);
    }
    if (!choice) return;
    pickedByUser.current = true;
    setSelectedFile(choice.file);
    setRevision((value) => value + 1);
    await install(choice);
  }

  async function remove() {
    const previous = installed;
    if (!previous) return;
    setBusy("remove");
    try {
      if (await apply(undefined, "remove")) {
        showUndoToast(t("optifine.toast.removed"), () => install(previous));
      }
    } finally {
      setBusy(null);
    }
  }

  const facts = (
    <FactRows surface="card" className="border-t border-border">
      <FactRow
        icon={<Globe className="size-3.5" />}
        label={t("optifine.facts.source")}
        value={t("optifine.facts.sourceValue")}
      />
      <FactRow
        icon={<Download className="size-3.5" />}
        label={t("optifine.facts.file")}
        value={
          !selected ? (
            "—"
          ) : stored ? (
            <span className="flex items-center gap-1.5 text-success">
              <CircleCheck className="size-3" />
              {t("optifine.facts.fileStored")}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {t("optifine.facts.fileDownload")}
            </span>
          )
        }
      />
      <FactRow
        icon={<Wrench className="size-3.5" />}
        label={t("optifine.facts.method")}
        value={t(
          loader === "forge"
            ? "optifine.facts.methodForge"
            : "optifine.facts.methodVanilla",
        )}
      />
      {loader === "forge" && (
        <FactRow
          icon={<Layers className="size-3.5" />}
          label="Forge"
          value={
            !selected?.forge ? (
              "—"
            ) : fit === "older" ? (
              <span className="text-warning">
                {t("optifine.facts.forgeOlder", {
                  required: selected.forge,
                  current: forgeVersion,
                })}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <CircleCheck className="size-3 text-success" />
                {t("optifine.facts.forgeOk", { required: selected.forge })}
              </span>
            )
          }
        />
      )}
    </FactRows>
  );

  const notes: ReactNode[] = [
    <Note key="terms" icon={Info}>
      {t("optifine.notes.terms")}
    </Note>,
  ];
  if (fit === "older" && selected) {
    notes.unshift(
      <Note key="forge" icon={TriangleAlert} tone="warning">
        {t("optifine.notes.forgeOlder", { version: selected.forge })}
      </Note>,
    );
  }
  notes.push(
    <Note key="shaders" icon={Info}>
      {t("optifine.notes.shaders")}
    </Note>,
  );

  const isWorking = busy !== null;
  const primaryLabel =
    busy === "download"
      ? t("optifine.actions.downloading")
      : busy === "install"
        ? t("optifine.actions.installing")
        : isCurrent
          ? t("optifine.actions.installed")
          : selected
            ? t(stored ? "optifine.actions.install" : "optifine.actions.download", {
                edition: optifineLabel(selected.edition),
              })
            : t("optifine.actions.pick");

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex h-7 shrink-0 items-center gap-2">
        <Gauge className="size-3.5 shrink-0 text-faint" />
        <Hint content={t("optifine.title")} variant="text" truncatedOnly>
          <span className="min-w-0 flex-1 truncate text-2xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
            {t("optifine.title")}
          </span>
        </Hint>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-2xs text-faint"
          onClick={onClose}
        >
          <X />
          {t("common.close")}
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,300px)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-3">
        <PickerList
          label={t("optifine.list.title")}
          items={items}
          total={builds.length}
          value={selectedFile}
          query={query}
          onQueryChange={setQuery}
          isLoading={catalog.isLoading}
          isDisabled={isWorking}
          emptyText={
            catalog.failed
              ? t("optifine.list.siteFailed")
              : t(
                  loader === "forge"
                    ? "optifine.list.emptyForge"
                    : "optifine.list.empty",
                  { version: minecraft },
                )
          }
          emptyAction={
            catalog.failed ? (
              <Button size="sm" variant="outline" onClick={catalog.reload}>
                <RotateCw />
                {t("common.retry")}
              </Button>
            ) : undefined
          }
          onSelect={(id) => {
            pickedByUser.current = true;
            setSelectedFile(id);
          }}
        />

        <div className="flex min-h-0 flex-col gap-3">
          <section className="shrink-0 overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                <Gauge className="size-5 text-muted-foreground" />
              </span>

              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-xs text-muted-foreground">
                  OptiFine · Minecraft {minecraft}
                </span>
                <span className="flex min-w-0 items-center gap-2 font-mono text-lg leading-tight font-semibold tabular-nums">
                  <span
                    className={cn(
                      "shrink-0",
                      selected && !isCurrent && "text-muted-foreground",
                    )}
                  >
                    {installed
                      ? optifineLabel(installed.edition)
                      : t("optifine.row.none")}
                  </span>
                  {selected && !isCurrent && (
                    <>
                      <ArrowRight className="size-4 shrink-0 text-faint" />
                      <span className="min-w-0 truncate">
                        {optifineLabel(selected.edition)}
                      </span>
                    </>
                  )}
                </span>
              </div>
            </div>

            {facts}
          </section>

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
            <ul className="grid gap-2 overflow-y-auto px-3 py-2.5">{notes}</ul>
          </section>

          <div className="flex h-9 shrink-0 items-center gap-2">
            <Hint content={blocked} variant="text" truncatedOnly>
              <span className="min-w-0 flex-1 truncate text-xs text-warning">
                {blocked}
              </span>
            </Hint>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!!blocked || isWorking}
              onClick={() => void installFromFile()}
            >
              <FileUp />
              {t("optifine.actions.pickFile")}
            </Button>

            {installed && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!!blocked || isWorking}
                onClick={() => void remove()}
              >
                {busy === "remove" ? <Loader2 className="animate-spin" /> : <X />}
                {t("optifine.actions.remove")}
              </Button>
            )}

            <Button
              type="button"
              variant="secondary"
              disabled={!selected || isCurrent || !!blocked || isWorking}
              onClick={() => void downloadAndInstall()}
            >
              {busy === "download" || busy === "install" ? (
                <Loader2 className="animate-spin" />
              ) : isCurrent ? (
                <CircleCheck />
              ) : (
                <Download />
              )}
              {primaryLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
