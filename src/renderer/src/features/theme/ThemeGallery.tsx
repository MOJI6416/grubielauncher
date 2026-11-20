import { useCallback, useEffect, useRef, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  Check,
  Download,
  Loader2,
  Palette,
  RefreshCw,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import type { ThemeDefinition, ThemeMode } from "@/shared/themes";
import { classifyError } from "@/shared/errors";
import {
  GALLERY_PAGE_SIZE,
  type GallerySort,
  type GalleryTheme,
  type PublishedTheme,
} from "@/shared/themeGallery";
import { Hint } from "@renderer/components/Hint";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { AuthorLink } from "@renderer/features/profile/AuthorLink";
import { accountAtom } from "@renderer/stores/atoms";
import {
  consumeRecentFailure,
  describeFailure,
  showFailureToast,
} from "@renderer/utilities/failures";
import { showErrorToast } from "@renderer/utilities/errorToast";
import { formatCompactNumber } from "@renderer/utilities/numbers";
import { SegmentedControl } from "@renderer/components/SegmentedControl";
import { SortMenu } from "@renderer/components/SortMenu";
import { ThemeTraits } from "./ThemeCard";
import { ThemeMiniature } from "./ThemeMiniature";
import {
  galleryFocusAtom,
  installGalleryTheme,
  myPublicationsVersionAtom,
} from "./gallery";

const api = window.api;

type ModeFilter = "all" | ThemeMode;

function asDefinition(item: GalleryTheme): ThemeDefinition {
  return {
    id: item.id,
    name: item.name,
    mode: item.mode,
    colors: item.colors,
    backdrop: item.backdrop
      ? {
          path: "",
          dim: item.backdrop.dim,
          blur: item.backdrop.blur,
          panelOpacity: item.backdrop.panelOpacity,
          fit: item.backdrop.fit,
          focusX: item.backdrop.focusX,
          focusY: item.backdrop.focusY,
        }
      : null,
  };
}

function GalleryCard({
  item,
  accent,
  state,
  installing,
  onInstall,
}: {
  item: GalleryTheme;
  accent: string;
  state: "new" | "installed" | "active";
  installing: boolean;
  onInstall: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-1.5",
        state === "active" ? "border-primary/60 bg-primary-soft" : "border-border bg-surface-2",
      )}
    >
      <ThemeMiniature
        theme={asDefinition(item)}
        accent={accent}
        imageUrl={item.backdrop?.thumbUrl}
        className={cn("rounded-md ring-1", state === "active" ? "ring-primary/60" : "ring-border")}
      />
      <div className="min-w-0 px-1">
        <Hint content={item.name} variant="text" truncatedOnly>
          <div className="truncate text-sm font-medium text-foreground">
            {item.name || t("theme.gallery.untitled")}
          </div>
        </Hint>
        <div className="flex items-center gap-1.5 text-xs text-faint">
          {item.authorId && item.authorName ? (
            <AuthorLink
              author={{ id: item.authorId, nickname: item.authorName }}
              headClassName="rounded-[3px]"
            />
          ) : (
            <Hint content={item.authorName ?? ""} variant="text" truncatedOnly>
              <span className="truncate">{item.authorName ?? t("theme.gallery.unknownAuthor")}</span>
            </Hint>
          )}
          <span className="inline-flex shrink-0 items-center gap-0.5 font-mono tabular-nums">
            <Download className="size-3" />
            {formatCompactNumber(item.downloads) ?? "0"}
          </span>
          <ThemeTraits theme={item} />
        </div>
      </div>
      <Button
        variant="secondary"
        size="sm"
        disabled={installing || state === "active"}
        aria-busy={installing || undefined}
        onClick={onInstall}
      >
        {installing ? (
          <>
            <Loader2 className="animate-spin" />
            {t("theme.gallery.installing")}
          </>
        ) : state === "active" ? (
          <>
            <Check />
            {t("theme.gallery.active")}
          </>
        ) : state === "installed" ? (
          t("theme.gallery.apply")
        ) : (
          <>
            <Download />
            {t("theme.gallery.install")}
          </>
        )}
      </Button>
    </div>
  );
}

const STATUS_TONE: Record<PublishedTheme["status"], string> = {
  approved: "bg-success",
  pending: "bg-warning",
  rejected: "bg-destructive",
};

function failureReason(channel: string): string | null {
  const info = consumeRecentFailure({ channels: [channel] });
  return info ? describeFailure(info).reason : null;
}

function MyPublications({ token }: { token: string }) {
  const { t } = useTranslation();
  const version = useAtomValue(myPublicationsVersionAtom);
  const [items, setItems] = useState<PublishedTheme[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pendingRemove, setPendingRemove] = useState<PublishedTheme | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api.theme
      .mine(token)
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setItems(result);
          return;
        }
        setError(failureReason("theme:mine") ?? t("theme.gallery.errors.mineFailed"));
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(describeFailure(classifyError(reason, { channel: "theme:mine" })).reason);
      });
    return () => {
      cancelled = true;
    };
  }, [token, version, attempt, t]);

  const remove = async (item: PublishedTheme) => {
    setPendingRemove(null);
    try {
      if (!(await api.theme.unpublish(token, item.id))) throw new Error("unpublish");
      setItems((current) => current?.filter((theme) => theme.id !== item.id) ?? null);
      toast.success(t("theme.gallery.unpublished", { name: item.name }));
    } catch (error) {
      showFailureToast(t("theme.gallery.errors.unpublish"), error, {
        channels: ["theme:unpublish"],
      });
    }
  };

  if (!error && (!items || items.length === 0)) return null;

  return (
    <section className="flex flex-col gap-1.5" aria-label={t("theme.gallery.mine")}>
      <div className="flex items-baseline gap-2 px-0.5">
        <h4 className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
          {t("theme.gallery.mine")}
        </h4>
        {items && items.length > 0 && (
          <span className="font-mono text-3xs tabular-nums text-faint">{items.length}</span>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="flex min-h-10 items-center gap-3 rounded-lg bg-surface-2 px-3 py-1.5"
        >
          <TriangleAlert className="size-3.5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <div className="text-sm text-foreground">{t("theme.gallery.errors.mineFailed")}</div>
            {error !== t("theme.gallery.errors.mineFailed") && (
              <div className="text-xs text-muted-foreground">{error}</div>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setAttempt((value) => value + 1)}>
            <RefreshCw />
            {t("common.retry")}
          </Button>
        </div>
      )}

      {!error &&
        items?.map((item) => (
          <div
            key={item.id}
            className="flex min-h-10 items-center gap-3 rounded-lg bg-surface-2 px-3 py-1.5"
          >
            <Hint content={item.name} variant="text" truncatedOnly>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{item.name}</span>
            </Hint>
            {item.status === "rejected" && item.rejectionReason && (
              <Hint content={item.rejectionReason} variant="text" truncatedOnly>
                <span className="max-w-60 truncate text-xs text-faint">{item.rejectionReason}</span>
              </Hint>
            )}
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden className={cn("size-1.5 rounded-full", STATUS_TONE[item.status])} />
              {t(`theme.gallery.status.${item.status}`)}
            </span>
            <Hint content={`${t("theme.gallery.unpublish")} — ${item.name}`}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${t("theme.gallery.unpublish")} — ${item.name}`}
                onClick={() => setPendingRemove(item)}
              >
                <Trash2 />
              </Button>
            </Hint>
          </div>
        ))}

      {pendingRemove && (
        <Confirmation
          title={t("theme.gallery.unpublishQuestion", { name: pendingRemove.name })}
          onClose={() => setPendingRemove(null)}
          reversible={false}
          content={[{ text: t("theme.gallery.unpublishConfirm", { name: pendingRemove.name }) }]}
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setPendingRemove(null),
            },
            {
              text: t("theme.gallery.unpublish"),
              color: "danger",
              onClick: () => void remove(pendingRemove),
            },
          ]}
        />
      )}
    </section>
  );
}

function FocusedTheme({
  id,
  accent,
  onClose,
}: {
  id: string;
  accent: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [item, setItem] = useState<GalleryTheme | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const fail = (error?: unknown) => {
      if (cancelled) return;
      const info = error
        ? classifyError(error, { channel: "theme:galleryGet" })
        : consumeRecentFailure({ channels: ["theme:galleryGet"] });
      if (info && info.cause !== "notFound") {
        const described = describeFailure(info);
        showErrorToast(
          t("theme.gallery.errors.load"),
          described.text,
          t("common.copy"),
          undefined,
          described.technical,
        );
      } else {
        toast.error(t("theme.gallery.errors.notFound"));
      }
      setItem(null);
    };
    api.theme
      .galleryGet(id)
      .then((result) => {
        if (cancelled) return;
        if (result) setItem(result);
        else fail();
      })
      .catch(fail);
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  useEffect(() => {
    if (item === null) onClose();
  }, [item, onClose]);

  if (!item) return null;

  return (
    <Confirmation
      title={t("theme.gallery.installTitle", { name: item.name })}
      onClose={onClose}
      content={[
        {
          text: item.authorName
            ? t("theme.gallery.installBy", { author: item.authorName })
            : t("theme.gallery.installHint"),
        },
      ]}
      buttons={[
        { text: t("common.cancel"), color: "secondary", onClick: onClose },
        {
          text: t("theme.gallery.install"),
          onClick: async () => {
            await installGalleryTheme(item);
            onClose();
          },
        },
      ]}
    >
      <ThemeMiniature
        theme={asDefinition(item)}
        accent={accent}
        imageUrl={item.backdrop?.thumbUrl}
        className="rounded-md ring-1 ring-border"
      />
    </Confirmation>
  );
}

export function ThemeGallery({
  accent,
  activeId,
  userThemes,
}: {
  accent: string;
  activeId: string;
  userThemes: ThemeDefinition[];
}) {
  const { t } = useTranslation();
  const account = useAtomValue(accountAtom);
  const [focus, setFocus] = useAtom(galleryFocusAtom);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<ModeFilter>("all");
  const [sort, setSort] = useState<GallerySort>("new");
  const [items, setItems] = useState<GalleryTheme[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<ReadonlySet<string>>(new Set());
  const request = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(input.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [input]);

  const load = useCallback(
    async (nextPage: number) => {
      const id = ++request.current;
      setStatus("loading");
      setLoadError(null);
      try {
        const result = await api.theme.galleryList({
          search,
          mode: mode === "all" ? undefined : mode,
          sort,
          page: nextPage,
        });
        if (id !== request.current) return;
        if (!result) {
          setLoadError(failureReason("theme:galleryList"));
          setStatus("error");
          return;
        }
        setItems((current) => (nextPage === 1 ? result.items : [...current, ...result.items]));
        setTotal(result.total);
        setPage(nextPage);
        setStatus("ready");
      } catch (error) {
        if (id !== request.current) return;
        setLoadError(describeFailure(classifyError(error, { channel: "theme:galleryList" })).reason);
        setStatus("error");
      }
    },
    [mode, search, sort],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  const install = async (item: GalleryTheme) => {
    setInstalling((current) => new Set(current).add(item.id));
    await installGalleryTheme(item);
    setInstalling((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
  };

  const stateOf = (item: GalleryTheme): "new" | "installed" | "active" => {
    const local = userThemes.find((theme) => theme.galleryId === item.id);
    if (!local) return "new";
    return local.id === activeId ? "active" : "installed";
  };

  const hasMore = items.length < total;
  const filtered = !!search || mode !== "all";

  return (
    <div className="flex flex-col gap-3">
      {account?.accessToken ? (
        <MyPublications token={account.accessToken} />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t("theme.gallery.search")}
            aria-label={t("theme.gallery.search")}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <SegmentedControl<ModeFilter>
          value={mode}
          ariaLabel={t("theme.gallery.modeLabel")}
          onChange={setMode}
          options={[
            { value: "all", label: t("theme.gallery.mode.all") },
            { value: "dark", label: t("theme.gallery.mode.dark") },
            { value: "light", label: t("theme.gallery.mode.light") },
          ]}
        />
        <SortMenu<GallerySort>
          value={sort}
          onChange={setSort}
          options={[
            { value: "new", label: t("theme.gallery.sort.new") },
            { value: "downloads", label: t("theme.gallery.sort.downloads") },
          ]}
        />
      </div>

      {status === "error" && items.length === 0 ? (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-lg bg-surface-2 px-4 py-3.5">
          <div className="text-sm text-foreground">{t("theme.gallery.errors.loadFailed")}</div>
          {loadError && <div className="text-xs text-muted-foreground">{loadError}</div>}
          <Button variant="secondary" size="sm" onClick={() => void load(1)}>
            <RefreshCw />
            {t("common.retry")}
          </Button>
        </div>
      ) : status === "loading" && items.length === 0 ? (
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Empty className="rounded-lg bg-surface-2 p-5">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {filtered ? <Search /> : <Palette />}
            </EmptyMedia>
            <EmptyTitle>
              {filtered ? t("theme.gallery.emptyFiltered") : t("theme.gallery.empty")}
            </EmptyTitle>
            {!filtered && (
              <EmptyDescription className="text-xs">
                {t("theme.gallery.emptyHint")}
              </EmptyDescription>
            )}
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2">
            {items.map((item) => (
              <GalleryCard
                key={item.id}
                item={item}
                accent={accent}
                state={stateOf(item)}
                installing={installing.has(item.id)}
                onInstall={() => void install(item)}
              />
            ))}
          </div>
          {status === "error" && (
            <div role="alert" className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <TriangleAlert className="size-3.5 shrink-0 text-destructive" />
              {loadError ?? t("theme.gallery.errors.loadFailed")}
            </div>
          )}
          {hasMore && (
            <Button
              variant="ghost"
              size="sm"
              className="self-center"
              disabled={status === "loading"}
              onClick={() => void load(page + 1)}
            >
              {status === "loading" && <Loader2 className="animate-spin" />}
              {status === "error"
                ? t("common.retry")
                : t("theme.gallery.more", { count: Math.min(GALLERY_PAGE_SIZE, total - items.length) })}
            </Button>
          )}
        </>
      )}

      {focus && (
        <FocusedTheme id={focus} accent={accent} onClose={() => setFocus(null)} />
      )}
    </div>
  );
}
