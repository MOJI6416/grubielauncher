import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  ArrowRightLeft,
  Blocks,
  Box,
  Copy,
  FolderOpen,
  Info,
  Loader2,
  Ruler,
  Search,
  Shapes,
  Trash,
  TriangleAlert,
  User,
} from "lucide-react";
import { toast } from "sonner";
import {
  ISchematicDetails,
  ISchematicFile,
  SchematicFormat,
  SchematicInspectResult,
} from "@/types/Schematic";
import { Version } from "@renderer/classes/Version";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Hint } from "@renderer/components/Hint";
import { LocalErrorBoundary } from "@renderer/components/LocalErrorBoundary";
import { ListSkeleton } from "@renderer/components/ListSkeleton";
import { RemovalItem, RemovalList } from "@renderer/components/RemovalCollapse";
import { accountAtom, versionsAtom } from "@renderer/stores/atoms";
import { isOwner } from "@renderer/utilities/versionPure";
import { formatBytes } from "@renderer/utilities/file";
import { formatDate, formatRelative } from "@renderer/utilities/date";
import { formatNumber } from "@renderer/utilities/numbers";
import { showFailureToast } from "@renderer/utilities/failures";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { removeWithUndo } from "@renderer/utilities/removeWithUndo";
import { useInstanceDataRevision } from "@renderer/features/instances/instanceRevision";
import { countFeature } from "@renderer/features/usage/usage";
import { MaterialsList } from "./schematic3d/MaterialsList";
import { useBlockInfo } from "./schematic3d/blockInfo";
import { useSchematicThumbnail } from "./schematic3d/thumbnails";

const api = window.api;

const SchematicViewer = lazy(() =>
  import("./schematic3d/SchematicViewer").then((module) => ({
    default: module.SchematicViewer,
  })),
);

const FORMAT_LABELS: Record<Exclude<SchematicFormat, "structure">, string> = {
  litematic: "Litematica",
  sponge: "Sponge",
  mcedit: "MCEdit",
};

export type SchematicsStatus = "loading" | "ready";

export function useSchematics(version: Version | undefined) {
  const revision = useInstanceDataRevision();
  const [files, setFiles] = useState<ISchematicFile[]>([]);
  const [status, setStatus] = useState<SchematicsStatus>("loading");
  const request = useRef(0);

  const reload = useCallback(async () => {
    const id = ++request.current;
    if (!version) {
      setFiles([]);
      setStatus("ready");
      return;
    }
    const list = await api.schematics
      .list(version.versionPath)
      .catch(ignoreFailure);
    if (id !== request.current) return;
    setFiles(list ?? []);
    setStatus("ready");
  }, [version]);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  useEffect(() => {
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  return { files, setFiles, status, reload };
}

function useFormatLabel() {
  const { t } = useTranslation();
  return (format: SchematicFormat) =>
    format === "structure" ? t("schematics.structure") : FORMAT_LABELS[format];
}

export function SchematicsView({
  version,
  files,
  status,
  header,
  onRemoved,
  onRestored,
}: {
  version: Version;
  files: ISchematicFile[];
  status: SchematicsStatus;
  header: ReactNode;
  onRemoved: (file: ISchematicFile) => void;
  onRestored: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const formatLabel = useFormatLabel();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const folder = api.path.join(version.versionPath, "schematics");

  useEffect(() => {
    void api.fs.ensure(folder).catch(ignoreFailure);
  }, [folder]);

  const sizeLabels = [
    t("sizes.0"),
    t("sizes.1"),
    t("sizes.2"),
    t("sizes.3"),
    t("sizes.4"),
  ];

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? files.filter((file) =>
          file.relativePath.toLowerCase().includes(needle),
        )
      : files;
  }, [files, query]);
  const paths = useMemo(() => new Set(files.map((file) => file.path)), [files]);

  const current =
    visible.find((file) => file.path === selected) ?? visible[0] ?? null;

  const remove = useCallback(
    (file: ISchematicFile) =>
      removeWithUndo({
        target: file.path,
        parkDir: version.versionPath,
        title: t("schematics.deleted"),
        description: file.fileName,
        failTitle: t("schematics.deleteError"),
        onRemoved: () => onRemoved(file),
        onRestored,
      }),
    [onRemoved, onRestored, t, version.versionPath],
  );

  const openFolder = async (target?: ISchematicFile) => {
    try {
      if (target) {
        await api.shell.showItemInFolder(target.path);
        return;
      }
      if (!(await api.fs.ensure(folder))) {
        throw new Error(`Could not create ${folder}`);
      }
      await api.shell.openPath(folder);
    } catch (error) {
      showFailureToast(t("schematics.openFolderError"), error, {
        channels: ["fs:ensure", "shell:"],
      });
    }
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-[16.5rem_minmax(0,1fr)] gap-3">
      <div className="flex min-h-0 flex-col gap-2 rounded-xl border bg-card p-2">
        {header}

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            className="h-8 pl-7 text-xs"
            placeholder={t("schematics.search")}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          {status === "loading" ? (
            <ListSkeleton rows={6} rowClassName="h-11" iconClassName="size-8 rounded-md" />
          ) : visible.length === 0 ? (
            <p className="px-1.5 py-3 text-xs text-muted-foreground">
              {files.length ? t("schematics.notFound") : t("schematics.empty")}
            </p>
          ) : (
            <div
              role="listbox"
              tabIndex={0}
              aria-label={t("schematics.title")}
              className="flex flex-col gap-0.5 pr-1 outline-none"
              onKeyDown={(event) => {
                if (!current) return;
                if (event.key === "Delete") {
                  event.preventDefault();
                  void remove(current);
                  return;
                }
                if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                event.preventDefault();
                const index = visible.indexOf(current);
                const next =
                  visible[
                    Math.max(
                      0,
                      Math.min(
                        visible.length - 1,
                        index + (event.key === "ArrowDown" ? 1 : -1),
                      ),
                    )
                  ];
                if (next) setSelected(next.path);
              }}
            >
              <RemovalList sourceKeys={paths}>
                {visible.map((file, index) => (
                  <RemovalItem key={file.path} itemKey={file.path}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={file === current}
                      style={{ "--wave-index": index } as CSSProperties}
                      onClick={() => setSelected(file.path)}
                      className="flex w-full min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-row-hover aria-selected:bg-row-selected"
                    >
                      <SchematicThumb
                        file={file}
                        versionPath={version.versionPath}
                        className="size-8 rounded-md"
                        iconClassName="size-3.5"
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <Hint content={file.name} variant="text" truncatedOnly>
                          <span className="truncate text-xs font-medium">
                            {file.name}
                          </span>
                        </Hint>
                        <span className="flex min-w-0 items-center gap-1 font-mono text-3xs text-faint">
                          <span className="shrink-0">{formatLabel(file.format)}</span>
                          <span aria-hidden>·</span>
                          <span className="shrink-0">
                            {formatBytes(file.size, sizeLabels, 1)}
                          </span>
                          <span aria-hidden>·</span>
                          <span className="min-w-0 truncate">
                            {formatRelative(new Date(file.modifiedAt))}
                          </span>
                        </span>
                      </span>
                    </button>
                  </RemovalItem>
                ))}
              </RemovalList>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1 border-t pt-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 min-w-0 flex-1 justify-start bg-transparent px-1.5 text-xs text-muted-foreground"
            onClick={() => void openFolder()}
          >
            <FolderOpen className="size-3.5" />
            <Hint content={t("schematics.openFolder")} variant="text" truncatedOnly>
              <span className="truncate">{t("schematics.openFolder")}</span>
            </Hint>
          </Button>
        </div>
      </div>

      {current ? (
        <SchematicDetail
          key={`${current.path}:${current.modifiedAt}`}
          file={current}
          version={version}
          locale={locale}
          onDelete={() => void remove(current)}
          onShowInFolder={() => void openFolder(current)}
          onMoved={() => onRemoved(current)}
        />
      ) : (
        <Empty className="h-full border border-dashed border-border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Shapes />
            </EmptyMedia>
            <EmptyTitle>{t("schematics.emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("schematics.emptyHint")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}

function SchematicThumb({
  file,
  versionPath,
  className,
  iconClassName,
}: {
  file: ISchematicFile;
  versionPath: string;
  className: string;
  iconClassName: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const url = useSchematicThumbnail(file, versionPath, visible);

  useEffect(() => {
    const element = ref.current;
    if (!element || visible) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <span
      ref={ref}
      className={`flex shrink-0 items-center justify-center overflow-hidden border bg-surface-3 text-faint ${className}`}
    >
      {url ? (
        <img src={url} alt="" draggable={false} className="size-full object-contain" />
      ) : (
        <Box className={iconClassName} />
      )}
    </span>
  );
}

function SchematicDetail({
  file,
  version,
  locale,
  onDelete,
  onShowInFolder,
  onMoved,
}: {
  file: ISchematicFile;
  version: Version;
  locale: string;
  onDelete: () => void;
  onShowInFolder: () => void;
  onMoved: () => void;
}) {
  const { t } = useTranslation();
  const formatLabel = useFormatLabel();
  const [result, setResult] = useState<SchematicInspectResult | null>(null);
  const [paletteIds, setPaletteIds] = useState<string[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.schematics
      .inspect(file.path)
      .catch(ignoreFailure)
      .then((next) => {
        if (!cancelled) {
          setResult(next ?? { ok: false, error: "unreadable" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [file.path]);

  const details = result?.ok ? result.details : null;
  const title = details?.name && details.name !== file.name ? details.name : file.name;
  const blockIds = useMemo(
    () => [...(details?.blocks.map((block) => block.id) ?? []), ...paletteIds],
    [details, paletteIds],
  );
  const blockInfo = useBlockInfo(version.versionPath, blockIds);

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex shrink-0 items-center gap-3 border-b px-3 py-2.5">
        <SchematicThumb
          file={file}
          versionPath={version.versionPath}
          className="size-12 rounded-lg"
          iconClassName="size-5"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Hint content={title} variant="text" truncatedOnly>
            <p className="truncate text-sm font-semibold">{title}</p>
          </Hint>
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <Chip>{formatLabel(file.format)}</Chip>
            {file.folder === "worldedit" && <Chip>WorldEdit</Chip>}
            <Hint content={file.relativePath} variant="text" truncatedOnly>
              <span className="min-w-0 truncate font-mono text-3xs text-faint">
                {file.relativePath}
              </span>
            </Hint>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <TransferMenu file={file} version={version} onMoved={onMoved} />
          <Hint content={t("schematics.showInFolder")}>
            <Button
              variant="outline"
              size="icon-sm"
              className="size-9"
              aria-label={t("schematics.showInFolder")}
              onClick={onShowInFolder}
            >
              <FolderOpen />
            </Button>
          </Hint>
          <Hint content={t("common.delete")}>
            <Button
              variant="outline"
              size="icon-sm"
              className="size-9 hover:text-destructive"
              aria-label={t("common.delete")}
              onClick={onDelete}
            >
              <Trash />
            </Button>
          </Hint>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        {result === null ? (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_16rem] gap-2">
            <Skeleton className="h-full rounded-xl" />
            <Skeleton className="h-full rounded-xl" />
          </div>
        ) : !details ? (
          <Empty className="h-full border border-dashed border-border bg-surface-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TriangleAlert />
              </EmptyMedia>
              <EmptyTitle>{t("schematics.unreadable")}</EmptyTitle>
              <EmptyDescription>
                {t(`schematics.errors.${result.ok ? "unreadable" : result.error}`)}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <SchematicFacts details={details} file={file} locale={locale} />
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_16rem] gap-2">
              <LocalErrorBoundary
                key={file.path}
                fallback={
                  <Empty className="h-full rounded-xl border border-border bg-surface-1">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <TriangleAlert />
                      </EmptyMedia>
                      <EmptyTitle>{t("schematics.viewer.failed")}</EmptyTitle>
                      <EmptyDescription>{t("schematics.viewer.crashedHint")}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                }
              >
                <Suspense fallback={<Skeleton className="h-full rounded-xl" />}>
                  <SchematicViewer
                    file={file}
                    versionPath={version.versionPath}
                    info={blockInfo.get}
                    onPick={setFocusId}
                    onPalette={setPaletteIds}
                  />
                </Suspense>
              </LocalErrorBoundary>
              <MaterialsList
                title={title}
                blocks={details.blocks}
                info={blockInfo.get}
                focusId={focusId}
                emptyText={
                  details.blockCount === null
                    ? t("schematics.tooBigToCount")
                    : t("schematics.noBlocks")
                }
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SchematicFacts({
  details,
  file,
  locale,
}: {
  details: ISchematicDetails;
  file: ISchematicFile;
  locale: string;
}) {
  const { t } = useTranslation();
  const nf = (value: number) => formatNumber(value, locale);
  const { x, y, z } = details.size;
  const changed = details.modifiedAt ?? details.createdAt ?? file.modifiedAt;

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1.5">
      <Fact icon={Ruler} label={t("schematics.size")} value={`${nf(x)} × ${nf(y)} × ${nf(z)}`} mono />
      <Fact
        icon={Blocks}
        label={t("schematics.blocks")}
        value={details.blockCount === null ? "—" : nf(details.blockCount)}
        mono
      />
      <Fact icon={Shapes} label={t("schematics.blockTypes")} value={nf(details.blockTypes)} mono />
      <Fact
        icon={User}
        label={t("schematics.author")}
        value={details.author ?? "—"}
        hint={`${t("schematics.author")}: ${details.author ?? "—"} · ${formatDate(new Date(changed))}`}
        grow
      />
      {details.description && (
        <Hint content={details.description}>
          <span
            aria-label={details.description}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-surface-1 text-faint"
          >
            <Info className="size-3.5" />
          </span>
        </Hint>
      )}
    </div>
  );
}

function TransferMenu({
  file,
  version,
  onMoved,
}: {
  file: ISchematicFile;
  version: Version;
  onMoved: () => void;
}) {
  const { t } = useTranslation();
  const versions = useAtomValue(versionsAtom);
  const account = useAtomValue(accountAtom);
  const [busy, setBusy] = useState(false);

  const targets = useMemo(
    () =>
      versions
        .filter(
          (instance) =>
            instance.versionPath !== version.versionPath &&
            !instance.version.downloadedVersion &&
            (!instance.version.owner && !instance.version.ownerId
              ? true
              : isOwner(
                  instance.version.owner,
                  account ?? undefined,
                  instance.version.ownerId,
                )),
        )
        .sort(
          (a, b) =>
            (new Date(b.version.lastLaunch ?? 0).getTime() || 0) -
            (new Date(a.version.lastLaunch ?? 0).getTime() || 0),
        ),
    [account, version.versionPath, versions],
  );

  const transfer = async (target: Version, mode: "copy" | "move") => {
    setBusy(true);
    try {
      const result = await api.schematics.transfer(
        version.versionPath,
        file.relativePath,
        target.versionPath,
        mode,
      );
      if (!result?.ok) {
        showFailureToast(t("schematics.transferError"), undefined, {
          channels: ["schematics:transfer"],
          fallbackDescription: t(
            `schematics.transferErrors.${result?.error ?? "failed"}`,
          ),
        });
        return;
      }
      countFeature("schematics.transfer");
      toast.success(
        t(mode === "move" ? "schematics.moved" : "schematics.copied", {
          instance: target.version.name,
        }),
        { description: result.relativePath },
      );
      if (mode === "move") onMoved();
    } catch (error) {
      showFailureToast(t("schematics.transferError"), error, {
        channels: ["schematics:transfer"],
      });
    } finally {
      setBusy(false);
    }
  };

  const list = (mode: "copy" | "move") =>
    targets.map((target) => (
      <DropdownMenuItem
        key={target.versionPath}
        onSelect={() => void transfer(target, mode)}
      >
        <Hint content={target.version.name} variant="text" truncatedOnly>
          <span className="min-w-0 max-w-56 truncate">{target.version.name}</span>
        </Hint>
      </DropdownMenuItem>
    ));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          disabled={busy || targets.length === 0}
        >
          {busy ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}
          {t("schematics.transfer")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ArrowRightLeft />
            <span>{t("schematics.moveTo")}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72">
            {list("move")}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Copy />
            <span>{t("schematics.copyTo")}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72">
            {list("copy")}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  hint,
  mono,
  grow,
}: {
  icon: typeof Ruler;
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
  grow?: boolean;
}) {
  return (
    <Hint content={hint ?? `${label}: ${value}`}>
      <div
        className={`flex h-8 min-w-0 items-center gap-1.5 rounded-lg border bg-surface-1 px-2 ${
          grow ? "flex-1" : "shrink-0"
        }`}
      >
        <Icon className="size-3.5 shrink-0 text-faint" aria-label={label} />
        <span
          className={`truncate text-xs leading-tight font-medium tabular-nums ${
            mono ? "font-mono" : ""
          }`}
        >
          {value}
        </span>
      </div>
    </Hint>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-3xs text-muted-foreground">
      {children}
    </span>
  );
}
