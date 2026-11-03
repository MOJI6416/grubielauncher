import { useCallback, useEffect, useRef, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Check, Download, Image as ImageIcon, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ThemeDefinition, ThemeMode } from "@/shared/themes";
import {
  GALLERY_PAGE_SIZE,
  type GallerySort,
  type GalleryTheme,
  type PublishedTheme,
} from "@/shared/themeGallery";
import { Hint } from "@renderer/components/Hint";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { accountAtom } from "@renderer/stores/atoms";
import { showFailureToast } from "@renderer/utilities/failures";
import { Segmented } from "@renderer/features/settings/SettingsPrimitives";
import { ThemeSwatch } from "./ThemeCard";
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
        }
      : null,
  };
}

function GalleryCard({
  item,
  accent,
  state,
  busy,
  onInstall,
}: {
  item: GalleryTheme;
  accent: string;
  state: "new" | "installed" | "active";
  busy: boolean;
  onInstall: () => void;
}) {
  const { t } = useTranslation();
  const formatter = new Intl.NumberFormat(undefined, { notation: "compact" });

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2 p-2">
      <ThemeSwatch
        theme={asDefinition(item)}
        accent={accent}
        imageUrl={item.backdrop?.thumbUrl}
        className="h-16"
      />
      <div className="min-w-0">
        <Hint content={item.name} truncatedOnly>
          <div className="truncate text-sm font-medium text-foreground">
            {item.name || t("theme.gallery.untitled")}
          </div>
        </Hint>
        <div className="flex items-center gap-1.5 text-xs text-faint">
          <span className="truncate">{item.authorName ?? t("theme.gallery.unknownAuthor")}</span>
          <span className="inline-flex shrink-0 items-center gap-0.5 font-mono tabular-nums">
            <Download className="size-3" />
            {formatter.format(item.downloads)}
          </span>
          {item.backdrop && <ImageIcon className="size-3 shrink-0" aria-label={t("theme.gallery.withPicture")} />}
        </div>
      </div>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy || state === "active"}
        onClick={onInstall}
      >
        {state === "active" ? (
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

function MyPublications({ token }: { token: string }) {
  const { t } = useTranslation();
  const version = useAtomValue(myPublicationsVersionAtom);
  const [items, setItems] = useState<PublishedTheme[] | null>(null);
  const [pendingRemove, setPendingRemove] = useState<PublishedTheme | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.theme
      .mine(token)
      .then((result) => {
        if (!cancelled) setItems(result ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token, version]);

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

  if (!items || items.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-xs font-medium text-muted-foreground">{t("theme.gallery.mine")}</div>
      {items.map((item) => (
        <div
          key={item.id}
          className="flex min-h-10 items-center gap-3 rounded-lg bg-surface-2 px-3 py-1.5"
        >
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{item.name}</span>
          <span
            className={cn(
              "shrink-0 text-xs",
              item.status === "approved" && "text-success",
              item.status === "pending" && "text-warning",
              item.status === "rejected" && "text-destructive",
            )}
          >
            {t(`theme.gallery.status.${item.status}`)}
          </span>
          {item.status === "rejected" && item.rejectionReason && (
            <Hint content={item.rejectionReason} truncatedOnly>
              <span className="max-w-60 truncate text-xs text-faint">{item.rejectionReason}</span>
            </Hint>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${t("theme.gallery.unpublish")} — ${item.name}`}
            onClick={() => setPendingRemove(item)}
          >
            <Trash2 />
          </Button>
        </div>
      ))}

      {pendingRemove && (
        <Confirmation
          title={t("theme.gallery.unpublish")}
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
    </div>
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
    void api.theme
      .galleryGet(id)
      .then((result) => {
        if (!cancelled) setItem(result);
      })
      .catch(() => {
        if (!cancelled) setItem(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (item !== null) return;
    toast.error(t("theme.gallery.errors.notFound"));
    onClose();
  }, [item, onClose, t]);

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
      <ThemeSwatch
        theme={asDefinition(item)}
        accent={accent}
        imageUrl={item.backdrop?.thumbUrl}
        className="h-28"
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
  const [installing, setInstalling] = useState<string | null>(null);
  const request = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(input.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [input]);

  const load = useCallback(
    async (nextPage: number) => {
      const id = ++request.current;
      setStatus("loading");
      try {
        const result = await api.theme.galleryList({
          search,
          mode: mode === "all" ? undefined : mode,
          sort,
          page: nextPage,
        });
        if (id !== request.current) return;
        if (!result) throw new Error("gallery");
        setItems((current) => (nextPage === 1 ? result.items : [...current, ...result.items]));
        setTotal(result.total);
        setPage(nextPage);
        setStatus("ready");
      } catch {
        if (id === request.current) setStatus("error");
      }
    },
    [mode, search, sort],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  const install = async (item: GalleryTheme) => {
    setInstalling(item.id);
    await installGalleryTheme(item);
    setInstalling(null);
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
        <Segmented
          value={mode}
          ariaLabel={t("theme.gallery.modeLabel")}
          onChange={setMode}
          options={[
            { value: "all", label: t("theme.gallery.mode.all") },
            { value: "dark", label: t("theme.gallery.mode.dark") },
            { value: "light", label: t("theme.gallery.mode.light") },
          ]}
        />
        <Segmented
          value={sort}
          ariaLabel={t("theme.gallery.sortLabel")}
          onChange={setSort}
          options={[
            { value: "new", label: t("theme.gallery.sort.new") },
            { value: "downloads", label: t("theme.gallery.sort.downloads") },
          ]}
        />
      </div>

      {status === "error" && items.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-lg bg-surface-2 px-4 py-3.5">
          <div className="text-sm text-foreground">{t("theme.gallery.errors.load")}</div>
          <Button variant="secondary" size="sm" onClick={() => void load(1)}>
            <RefreshCw />
            {t("common.retry")}
          </Button>
        </div>
      ) : status === "loading" && items.length === 0 ? (
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg bg-surface-2 px-4 py-3.5">
          <div className="text-sm text-foreground">
            {filtered ? t("theme.gallery.emptyFiltered") : t("theme.gallery.empty")}
          </div>
          {!filtered && (
            <div className="mt-1 text-xs text-muted-foreground">{t("theme.gallery.emptyHint")}</div>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2">
            {items.map((item) => (
              <GalleryCard
                key={item.id}
                item={item}
                accent={accent}
                state={stateOf(item)}
                busy={installing !== null}
                onInstall={() => void install(item)}
              />
            ))}
          </div>
          {hasMore && (
            <Button
              variant="ghost"
              size="sm"
              className="self-center"
              disabled={status === "loading"}
              onClick={() => void load(page + 1)}
            >
              {t("theme.gallery.more", { count: Math.min(GALLERY_PAGE_SIZE, total - items.length) })}
            </Button>
          )}
        </>
      )}

      {account?.accessToken ? (
        <MyPublications token={account.accessToken} />
      ) : null}

      {focus && (
        <FocusedTheme id={focus} accent={accent} onClose={() => setFocus(null)} />
      )}
    </div>
  );
}
