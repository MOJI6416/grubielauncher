import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { toast } from "sonner";
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  ChevronRight,
  Download,
  EyeOff,
  ImageOff,
  Link2,
  Loader2,
  PackagePlus,
  RefreshCw,
  Share2,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { IModpack } from "@/types/Backend";
import { IUser } from "@/types/IUser";
import { accountAtom, networkAtom, versionsAtom } from "@renderer/stores/atoms";
import { openNewInstance } from "@renderer/features/instances/newInstance";
import { instanceKey } from "@renderer/features/instances/selectors";
import { navigate } from "@renderer/navigation/navigate";
import { isOwner } from "@renderer/utilities/versionPure";
import { buildPackShareUrl } from "@renderer/utilities/packShare";
import { showFailureToast } from "@renderer/utilities/failures";
import { formatDay, formatRelative } from "@renderer/utilities/date";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { Hint } from "@renderer/components/Hint";
import { useOwnModpacks } from "./useProfileData";
import { packShareCode, publishedShareCodes } from "./ownPacks";
import { copyToClipboard } from "@renderer/utilities/clipboard";

const api = window.api;

const LOADER_TEXT: Record<string, string> = {
  vanilla: "text-loader-vanilla",
  forge: "text-loader-forge",
  neoforge: "text-loader-neoforge",
  fabric: "text-loader-fabric",
  quilt: "text-loader-quilt",
};

export function ProfileModpacks({ user }: { user: IUser }) {
  const { t, i18n } = useTranslation();
  const account = useAtomValue(accountAtom);
  const isBackendOnline = useAtomValue(networkAtom);

  const modpacks = useOwnModpacks(true);
  const [pending, setPending] = useState<IModpack | null>(null);
  const [isDeleting, setDeleting] = useState(false);

  const bannedDay = user.publishBannedAt
    ? formatDay(new Date(user.publishBannedAt))
    : "";
  const bannedSince = bannedDay
    ? t("ownModpacks.publishBannedSince", { date: bannedDay })
    : "";

  const formatNumber = (value: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage || i18n.language).format(value);

  const list = useMemo(() => {
    const items = modpacks.data ?? [];
    return [...items].sort(
      (a, b) =>
        b.downloads - a.downloads ||
        new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime(),
    );
  }, [modpacks.data]);

  const isLoading = modpacks.isPending && modpacks.fetchStatus !== "idle";
  const isListKnown = modpacks.isSuccess;

  const totalDownloads = useMemo(
    () => list.reduce((sum, modpack) => sum + (modpack.downloads || 0), 0),
    [list],
  );

  const handleDelete = useCallback(async () => {
    if (!account?.accessToken || !pending) return;

    setDeleting(true);
    try {
      const result = await api.backend.deleteModpack(
        account.accessToken,
        pending._id,
      );

      if (!result) {
        showFailureToast(t("ownModpacks.deleteError"), undefined, {
          channels: ["backend:deleteModpack"],
        });
        return;
      }

      toast.success(t("ownModpacks.deleted"));
      await modpacks.refetch();
    } catch (error) {
      showFailureToast(t("ownModpacks.deleteError"), error);
    } finally {
      setDeleting(false);
      setPending(null);
    }
  }, [account, pending, modpacks, t]);

  return (
    <>
      <div className="flex h-full min-h-0 flex-col gap-3">
        {user.publishBanned && (
          <div className="flex shrink-0 items-start gap-2 rounded-lg border border-warning/40 bg-surface-2 px-3 py-2 text-xs text-warning">
            <ShieldAlert className="mt-px size-4 shrink-0 text-warning" />
            <div className="grid min-w-0 gap-0.5">
              <p className="min-w-0">
                {t("ownModpacks.publishBanned")}
                {bannedSince && (
                  <span className="ml-1.5 opacity-70">{bannedSince}</span>
                )}
              </p>
              {user.publishBanReason && (
                <Hint content={user.publishBanReason} variant="text">
                  <p className="min-w-0 truncate text-foreground">
                    {t("ownModpacks.publishBanReason", {
                      reason: user.publishBanReason,
                    })}
                  </p>
                </Hint>
              )}
            </div>
          </div>
        )}

        <section className="flex min-h-0 flex-auto flex-col gap-2.5 rounded-xl border border-border bg-card p-3">
          <header className="flex shrink-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-1 text-muted-foreground">
              <Boxes className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {t("ownModpacks.published", {
                  value: isListKnown ? formatNumber(list.length) : "—",
                })}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {t("ownModpacks.totalDownloads", {
                  value: isListKnown ? formatNumber(totalDownloads) : "—",
                })}
              </p>
            </div>
            <Hint content={t("common.refresh")}>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={modpacks.isFetching || !isBackendOnline}
                aria-label={t("common.refresh")}
                onClick={() => void modpacks.refetch()}
              >
                <RefreshCw
                  className={modpacks.isFetching ? "animate-spin" : ""}
                />
              </Button>
            </Hint>
          </header>

          <div className="-mr-1 min-h-0 overflow-y-auto pr-1">
            {isLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : !isBackendOnline ? (
              <EmptyState
                icon={AlertTriangle}
                text={t("app.backendUnavailable")}
              />
            ) : modpacks.isError ? (
              <EmptyState
                icon={AlertTriangle}
                text={t("ownModpacks.loadError")}
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void modpacks.refetch()}
                  >
                    {t("common.retry")}
                  </Button>
                }
              />
            ) : list.length === 0 ? (
              <EmptyState icon={Boxes} text={t("ownModpacks.noModpacks")} />
            ) : (
              <div className="grid gap-1.5">
                {list.map((modpack) => (
                  <ModpackRow
                    key={modpack._id}
                    modpack={modpack}
                    formatNumber={formatNumber}
                    isBusy={isDeleting && pending?._id === modpack._id}
                    onDelete={() => setPending(modpack)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <UnpublishedPanel published={list} isKnown={isListKnown} />

        <PublishingHints />
      </div>

      {pending && (
        <Confirmation
          title={t("ownModpacks.deleteTitle")}
          reversible={false}
          content={[
            {
              text: t("ownModpacks.confirmation", {
                name: pending.conf.name,
              }),
            },
            { text: t("ownModpacks.deleteLoss") },
          ]}
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setPending(null),
            },
            {
              text: t("ownModpacks.deleteAction"),
              color: "danger",
              loading: isDeleting,
              onClick: handleDelete,
            },
          ]}
          onClose={() => setPending(null)}
        />
      )}
    </>
  );
}

function UnpublishedPanel({
  published,
  isKnown,
}: {
  published: IModpack[];
  isKnown: boolean;
}) {
  const { t } = useTranslation();
  const account = useAtomValue(accountAtom);
  const versions = useAtomValue(versionsAtom);

  const candidates = useMemo(() => {
    // Matched on the share code the instance stored when it was published;
    // comparing it with the row id never matched, so every published build
    // also sat in the "not published" list.
    const shared = publishedShareCodes(published);

    return versions
      .filter((version) => isOwner(version.version.owner, account ?? undefined))
      .filter((version) => {
        const code = version.version.shareCode;
        return !code || !shared.has(code);
      })
      .map((version) => ({
        key: instanceKey(version),
        name: version.version.name,
        loader: version.version.loader?.name ?? "vanilla",
        mc: version.version.version?.id ?? "",
      }));
  }, [published, versions, account]);

  const emptyText = !isKnown
    ? t("ownModpacks.notPublishedUnknown")
    : versions.length === 0
      ? t("ownModpacks.notPublishedNoInstances")
      : t("ownModpacks.notPublishedEmpty");

  return (
    <section className="flex min-h-0 flex-auto flex-col gap-2 rounded-xl border border-border bg-card p-3">
      <header className="flex h-5 shrink-0 items-center gap-2">
        <Boxes className="size-4 shrink-0 text-faint" />
        <h3 className="min-w-0 truncate text-sm font-medium">
          {t("ownModpacks.notPublished")}
        </h3>
        <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-faint">
          {isKnown ? candidates.length : "—"}
        </span>
      </header>

      {!isKnown || candidates.length === 0 ? (
        <p className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-xs text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <div className="-mr-1 grid min-h-0 flex-1 content-start gap-1 overflow-y-auto pr-1">
          {candidates.map((candidate) => (
            <Hint key={candidate.key} content={t("ownModpacks.openInstance")}>
              <button
                type="button"
                onClick={() =>
                  navigate({ name: "instance", id: candidate.key })
                }
                className="flex h-9 min-w-0 shrink-0 items-center gap-2.5 rounded-lg bg-surface-1 px-2.5 text-left transition-colors hover:bg-surface-3"
              >
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {candidate.name}
                </span>
                <span
                  className={`shrink-0 text-[11px] capitalize ${
                    LOADER_TEXT[candidate.loader] ?? "text-faint"
                  }`}
                >
                  {candidate.loader}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-faint">
                  {candidate.mc}
                </span>
                <ChevronRight className="size-3.5 shrink-0 text-faint" />
              </button>
            </Hint>
          ))}
        </div>
      )}
    </section>
  );
}

function PublishingHints() {
  const { t } = useTranslation();
  const steps = [
    { icon: Share2, text: t("ownModpacks.helpStep1") },
    { icon: Link2, text: t("ownModpacks.helpStep2") },
    { icon: CalendarClock, text: t("ownModpacks.helpStep3") },
  ];

  return (
    <section className="shrink-0 rounded-xl border border-border bg-card p-3">
      <h3 className="mb-2 text-sm font-medium">{t("ownModpacks.helpTitle")}</h3>
      <div className="grid grid-cols-3 gap-2">
        {steps.map((step, index) => (
          <div
            key={index}
            className="flex min-w-0 items-start gap-2 rounded-lg bg-surface-1 p-2"
          >
            <step.icon className="mt-0.5 size-3.5 shrink-0 text-faint" />
            <p className="min-w-0 text-[11px] leading-snug text-muted-foreground">
              {step.text}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyState({
  icon: Icon,
  text,
  action,
}: {
  icon: typeof Boxes;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-8 text-center">
      <Icon className="size-6 text-faint" />
      <p className="text-sm text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}

function ModpackRow({
  modpack,
  formatNumber,
  isBusy,
  onDelete,
}: {
  modpack: IModpack;
  formatNumber: (value: number) => string;
  isBusy: boolean;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const isPublic = modpack.isPublic !== false;
  const loader = modpack.conf.loader?.name ?? "vanilla";

  return (
    <div className="flex h-14 min-w-0 items-center gap-3 rounded-lg bg-surface-1 px-2.5">
      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-3">
        {modpack.conf.image ? (
          <img
            src={modpack.conf.image}
            width={40}
            height={40}
            loading="lazy"
            className="size-full object-cover"
            alt=""
          />
        ) : (
          <ImageOff className="size-4 text-faint" />
        )}
      </div>

      <div className="grid min-w-0 flex-1 gap-0.5">
        <Hint content={modpack.conf.name} variant="text" truncatedOnly>
          <p className="truncate text-sm font-medium">{modpack.conf.name}</p>
        </Hint>
        <div className="flex min-w-0 items-center gap-2 text-[11px] text-faint">
          <span
            className={`shrink-0 capitalize ${LOADER_TEXT[loader] ?? "text-faint"}`}
          >
            {loader}
          </span>
          <span className="shrink-0 font-mono">{modpack.conf.version?.id}</span>
          <Hint
            content={formatDay(new Date(modpack.lastUpdate))}
            variant="text"
          >
            <span className="min-w-0 truncate">
              {t("ownModpacks.updated", {
                when: formatRelative(new Date(modpack.lastUpdate)),
              })}
            </span>
          </Hint>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {!isPublic && (
          <Hint content={t("ownModpacks.notListedHint")}>
            <span className="flex items-center gap-1 rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <EyeOff className="size-3" />
              {t("ownModpacks.notListed")}
            </span>
          </Hint>
        )}
        <Hint content={t("ownModpacks.downloads")}>
          <span className="flex items-center gap-1 font-mono text-xs tabular-nums text-muted-foreground">
            <Download className="size-3.5" />
            {formatNumber(modpack.downloads ?? 0)}
          </span>
        </Hint>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Hint content={t("ownModpacks.copyId")}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("ownModpacks.copyId")}
            onClick={async () => {
              if (!(await copyToClipboard(buildPackShareUrl(packShareCode(modpack))))) return;
              toast(t("common.copied"));
            }}
          >
            <Link2 />
          </Button>
        </Hint>
        <Hint content={t("ownModpacks.addToLauncher")}>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("ownModpacks.addToLauncher")}
            onClick={() => openNewInstance({ modpack })}
          >
            <PackagePlus />
          </Button>
        </Hint>
        <Hint content={t("common.delete")}>
          <Button
            variant="destructive"
            size="icon-sm"
            disabled={isBusy}
            aria-label={t("common.delete")}
            onClick={onDelete}
          >
            {isBusy ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </Button>
        </Hint>
      </div>
    </div>
  );
}
