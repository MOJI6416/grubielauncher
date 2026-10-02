import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FolderOpen,
  ImageUp,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { resolveLocalImage } from "@renderer/utilities/localMedia";
import { toFileUrl } from "@renderer/utilities/exportVersion";
import { screenshotLabel, sortScreenshots } from "./instanceOverview";
import { bumpInstanceDataRevision } from "./instanceRevision";
import type { InstanceScreenshot } from "./useInstanceInsights";

const api = window.api;

function shotSource(file: string) {
  return resolveLocalImage(toFileUrl(file));
}

function ToolButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Hint content={label}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={label}
        onClick={onClick}
        className={cn(
          "size-8 text-muted-foreground hover:text-foreground",
          danger && "hover:bg-destructive/15 hover:text-destructive",
        )}
      >
        {children}
      </Button>
    </Hint>
  );
}

export function ScreenshotViewer({
  folder,
  initialPath,
  onClose,
  onUseAsCover,
}: {
  folder: string;
  initialPath: string;
  onClose: () => void;
  onUseAsCover?: (file: string) => void;
}) {
  const { t } = useTranslation();
  const [shots, setShots] = useState<InstanceScreenshot[] | null>(null);
  const [index, setIndex] = useState(0);
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const stripRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const names = sortScreenshots(
        await api.fs.readdir(folder).catch(() => [] as string[]),
      );
      const list = await Promise.all(
        names.map(async (name) => ({
          name,
          path: await api.path.join(folder, name),
        })),
      );
      if (cancelled) return;
      setShots(list);
      setIndex(
        Math.max(
          0,
          list.findIndex((shot) => shot.path === initialPath),
        ),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [folder, initialPath]);

  const count = shots?.length ?? 0;
  const current = shots?.[index];

  const go = useCallback(
    (delta: number) => {
      if (count < 2) return;
      setIndex((value) => (value + delta + count) % count);
    },
    [count],
  );

  const copy = useCallback(async () => {
    if (!current) return;
    const ok = await api.clipboard.writeImage(current.path).catch(() => false);
    if (ok) toast.success(t("common.copied"));
    else toast.error(t("common.copyFailed"));
  }, [current, t]);

  const remove = useCallback(async () => {
    if (!current) return;
    const ok = await api.shell.trashItem(current.path).catch(() => false);
    if (!ok) {
      toast.error(t("versions.screenshots.deleteFailed"));
      return;
    }

    bumpInstanceDataRevision();
    toast.success(t("versions.screenshots.deleted"));
    const next = (shots ?? []).filter((shot) => shot.path !== current.path);
    if (next.length === 0) {
      onClose();
      return;
    }
    setShots(next);
    setIndex((value) => Math.min(value, next.length - 1));
  }, [current, onClose, shots, t]);

  useEffect(() => {
    if (isDeleteOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") go(-1);
      else if (event.key === "ArrowRight") go(1);
      else if (event.key === "Home") setIndex(0);
      else if (event.key === "End") setIndex(Math.max(0, count - 1));
      else if (event.key === "Delete") setDeleteOpen(true);
      else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "c"
      )
        void copy();
      else return;
      event.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copy, count, go, isDeleteOpen]);

  useEffect(() => {
    const strip = stripRef.current;
    const active = strip?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    active?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [index, shots]);

  return (
    <>
      <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          style={{
            top: "calc(env(titlebar-area-height, 0px))",
            left: 0,
            right: 0,
            bottom: 0,
            width: "auto",
            height: "auto",
            maxWidth: "none",
            maxHeight: "none",
            margin: 0,
            transform: "none",
          }}
          className="flex flex-col gap-0 border-0 bg-transparent p-0 shadow-none"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onClick={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest("button, img, [data-toolbar]")) return;
            onClose();
          }}
        >
          <DialogTitle className="sr-only">
            {t("versions.screenshots.title")}
          </DialogTitle>

          <div
            data-toolbar
            className="mx-auto mt-4 flex w-[min(100%-2rem,56rem)] items-center gap-2 rounded-xl border border-border bg-surface-1/95 px-3 py-1.5 shadow-lg"
          >
            <span className="shrink-0 font-mono text-xs tabular-nums text-faint">
              {count ? `${index + 1}/${count}` : "…"}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
              {current ? screenshotLabel(current.name) : ""}
            </span>
            {current && (
              <>
                <ToolButton
                  label={t("versions.screenshots.copy")}
                  onClick={() => void copy()}
                >
                  <Copy />
                </ToolButton>
                <ToolButton
                  label={t("versions.screenshots.showInFolder")}
                  onClick={() => void api.shell.showItemInFolder(current.path)}
                >
                  <FolderOpen />
                </ToolButton>
                <ToolButton
                  label={t("versions.screenshots.openExternal")}
                  onClick={() => void api.shell.openPath(current.path)}
                >
                  <ExternalLink />
                </ToolButton>
                {onUseAsCover && (
                  <ToolButton
                    label={t("versions.screenshots.useAsCover")}
                    onClick={() => {
                      onUseAsCover(current.path);
                      onClose();
                    }}
                  >
                    <ImageUp />
                  </ToolButton>
                )}
                <ToolButton
                  label={t("versions.screenshots.delete")}
                  onClick={() => setDeleteOpen(true)}
                  danger
                >
                  <Trash2 />
                </ToolButton>
              </>
            )}
            <span className="mx-1 h-5 w-px bg-border" />
            <ToolButton label={t("common.close")} onClick={onClose}>
              <X />
            </ToolButton>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-20 py-4">
            {count > 1 && (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => go(-1)}
                className="absolute left-6"
                aria-label={t("common.previous")}
              >
                <ChevronLeft className="size-5" />
              </Button>
            )}
            {current && (
              <img
                key={current.path}
                src={shotSource(current.path)}
                alt={screenshotLabel(current.name)}
                draggable={false}
                className="max-h-full max-w-full animate-in rounded-xl bg-surface-2 object-contain shadow-2xl fade-in-0 duration-150"
              />
            )}
            {count > 1 && (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => go(1)}
                className="absolute right-6"
                aria-label={t("common.next")}
              >
                <ChevronRight className="size-5" />
              </Button>
            )}
          </div>

          {count > 1 && (
            <div
              ref={stripRef}
              data-toolbar
              className="mx-auto mb-4 flex max-w-[calc(100%-2rem)] gap-1.5 overflow-x-auto rounded-xl border border-border bg-surface-1/95 p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {shots?.map((shot, position) => (
                <button
                  key={shot.path}
                  type="button"
                  data-index={position}
                  aria-label={screenshotLabel(shot.name)}
                  aria-current={position === index}
                  onClick={() => setIndex(position)}
                  className={cn(
                    "h-12 w-20 shrink-0 overflow-hidden rounded-md border-2 transition-opacity focus-visible:outline-none",
                    position === index
                      ? "border-primary"
                      : "border-transparent opacity-55 hover:opacity-100",
                  )}
                >
                  <img
                    src={shotSource(shot.path)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="size-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {isDeleteOpen && current && (
        <Confirmation
          title={t("versions.screenshots.deleteTitle")}
          reversible
          content={[{ text: t("versions.screenshots.deleteBody") }]}
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setDeleteOpen(false),
            },
            {
              text: t("versions.screenshots.delete"),
              color: "danger",
              onClick: async () => {
                setDeleteOpen(false);
                await remove();
              },
            },
          ]}
          onClose={() => setDeleteOpen(false)}
        />
      )}
    </>
  );
}
