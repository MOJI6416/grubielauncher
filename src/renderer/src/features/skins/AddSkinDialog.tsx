import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ClipboardPaste,
  FileImage,
  Link as LinkIcon,
  Loader2,
  Plus,
  TriangleAlert,
  Upload,
  User,
  WifiOff,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { showFailureToast } from "@renderer/utilities/failures";
import { SkinStage } from "./SkinStage";
import { decodeToPixels, fetchTextureBytes } from "./skinPixels";
import {
  inferSkinModel,
  inspectCapeTexture,
  inspectSkinTexture,
  SkinTextureInfo,
} from "./skinTexture";
import {
  AddSkinPreviewError,
  AddSkinSource,
  AddSkinType,
  addSkinSources,
  isLikelyTextureLink,
  isNicknameValid,
} from "./addSkin";

const api = window.api;

export type { AddSkinSource, AddSkinType } from "./addSkin";

export interface AddSkinRequest {
  source: AddSkinSource;
  type: AddSkinType;
  filePath?: string;
  value?: string;
}

interface PickedFile {
  path: string;
  name: string;
}

type Preview =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "error"; reason: AddSkinPreviewError }
  | {
      state: "ready";
      url: string;
      info: SkinTextureInfo;
      model: "slim" | "classic" | null;
    };

const SOURCE_ICON = {
  file: FileImage,
  link: LinkIcon,
  nick: User,
} as const;

export function AddSkinDialog({
  open,
  onOpenChange,
  allowCape,
  isOnline,
  busy,
  playerSkinUrl,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowCape: boolean;
  isOnline: boolean;
  busy: boolean;
  playerSkinUrl?: string;
  onSubmit: (request: AddSkinRequest) => Promise<boolean>;
}) {
  const { t } = useTranslation();

  const [type, setType] = useState<AddSkinType>("skin");
  const [source, setSource] = useState<AddSkinSource>("file");
  const [value, setValue] = useState("");
  const [debouncedValue, setDebouncedValue] = useState("");
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [preview, setPreview] = useState<Preview>({ state: "idle" });
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);

  const reset = useCallback(() => {
    setType("skin");
    setSource("file");
    setValue("");
    setDebouncedValue("");
    setPicked(null);
    setPreview({ state: "idle" });
    dragCounter.current = 0;
    setIsDragOver(false);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedValue(value.trim()), 400);
    return () => clearTimeout(id);
  }, [value]);

  useEffect(() => {
    if (source === "nick") {
      setPreview({ state: "idle" });
      return;
    }

    const target =
      source === "link" ? debouncedValue : picked ? `file://${picked.path}` : "";

    if (!target) {
      setPreview({ state: "idle" });
      return;
    }

    if (source === "link" && !isLikelyTextureLink(target)) {
      setPreview({ state: "error", reason: "badLink" });
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setPreview({ state: "loading" });

    void (async () => {
      const bytes = await fetchTextureBytes(target).catch(() => null);
      if (cancelled) return;

      if (!bytes && source === "link") {
        setPreview({ state: "error", reason: "unreachable" });
        return;
      }

      const check =
        type === "cape" ? inspectCapeTexture(bytes) : inspectSkinTexture(bytes);
      if (!check.ok) {
        setPreview({ state: "error", reason: check.problem });
        return;
      }

      const image = type === "skin" ? await decodeToPixels(bytes!) : null;
      if (cancelled) return;

      objectUrl = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: "image/png" }),
      );
      setPreview({
        state: "ready",
        url: objectUrl,
        info: check.info,
        model: image ? inferSkinModel(image) : null,
      });
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source, debouncedValue, picked, type]);

  const pickFile = useCallback(async () => {
    const files = await api.other.openFileDialog(false, [
      { name: "PNG", extensions: ["png"] },
    ]);
    if (!files?.length) return;

    setPicked({
      path: files[0],
      name: files[0].split(/[\\/]/).pop() || files[0],
    });
  }, []);

  const acceptDroppedFile = useCallback((file: File) => {
    const filePath = api.other.getPathForFile(file);
    if (!filePath) return;

    setSource("file");
    setPicked({ path: filePath, name: file.name });
  }, []);

  const acceptPastedFile = useCallback(
    async (file: File) => {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const tempDir = await api.other.getPath("temp");
      const target = tempDir
        ? api.path.join(tempDir, `grubie-skin-${Date.now()}.png`)
        : "";

      if (!target || !(await api.fs.writeFile(target, buffer))) {
        showFailureToast(t("manageSkins.pasteError"), null, {
          channels: ["fs:writeFile", "other:getPath"],
        });
        return;
      }

      setSource("file");
      setPicked({ path: target, name: file.name || "clipboard.png" });
    },
    [t],
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      const file = Array.from(event.clipboardData.files).find((item) =>
        item.type.startsWith("image/"),
      );
      if (!file) return;

      event.preventDefault();
      void acceptPastedFile(file);
    },
    [acceptPastedFile],
  );

  const sources = useMemo(() => addSkinSources(type), [type]);
  const needsInternet = source !== "file";
  const isOffline = needsInternet && !isOnline;

  const canSubmit = (() => {
    if (busy || isOffline) return false;
    if (source === "nick") return isNicknameValid(value);

    return preview.state === "ready";
  })();

  const submit = useCallback(async () => {
    const done = await onSubmit({
      source,
      type,
      filePath: picked?.path,
      value: value.trim(),
    });

    if (done) onOpenChange(false);
  }, [onSubmit, source, type, picked, value, onOpenChange]);

  const switchSource = useCallback((next: AddSkinSource) => {
    setSource(next);
    setValue("");
    setDebouncedValue("");
    setPreview({ state: "idle" });
  }, []);

  const switchType = useCallback((next: AddSkinType) => {
    setType(next);
    setValue("");
    setDebouncedValue("");
    setPicked(null);
    setPreview({ state: "idle" });
    setSource((current) =>
      next === "cape" && current === "nick" ? "file" : current,
    );
  }, []);

  const stageSkinUrl =
    type === "cape"
      ? playerSkinUrl
      : preview.state === "ready"
        ? preview.url
        : playerSkinUrl;
  const stageCapeUrl =
    type === "cape" && preview.state === "ready" ? preview.url : undefined;
  const isPlaceholder = preview.state !== "ready";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        data-account-click-ignore="true"
        className="sm:max-w-2xl"
        onPaste={handlePaste}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onDragEnter={(event) => {
          if (!Array.from(event.dataTransfer.types).includes("Files")) return;
          event.preventDefault();
          dragCounter.current += 1;
          setIsDragOver(true);
        }}
        onDragOver={(event) => {
          if (!Array.from(event.dataTransfer.types).includes("Files")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragCounter.current = Math.max(0, dragCounter.current - 1);
          if (dragCounter.current === 0) setIsDragOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragCounter.current = 0;
          setIsDragOver(false);

          const file = Array.from(event.dataTransfer.files).find((item) =>
            item.name.toLowerCase().endsWith(".png"),
          );
          if (file) acceptDroppedFile(file);
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3 pr-8">
            <span className="truncate">
              {type === "cape"
                ? t("manageSkins.addCape")
                : t("manageSkins.addSkin")}
            </span>
            {allowCape ? (
              <div className="inline-flex shrink-0 rounded-lg border border-border bg-surface-2 p-0.5">
                {(["skin", "cape"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    disabled={busy}
                    onClick={() => switchType(item)}
                    className={cn(
                      "h-7 rounded-md px-3 text-xs font-medium transition-colors",
                      type === item
                        ? "bg-surface-3 text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t(`manageSkins.${item}`)}
                  </button>
                ))}
              </div>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_232px]">
          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="inline-flex w-fit rounded-lg border border-border bg-surface-2 p-0.5">
              {sources.map((item) => {
                const Icon = SOURCE_ICON[item];

                return (
                  <button
                    key={item}
                    type="button"
                    disabled={busy}
                    onClick={() => switchSource(item)}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                      source === item
                        ? "bg-surface-3 text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5" />
                    {t(
                      item === "nick"
                        ? "manageSkins.nickname"
                        : `manageSkins.${item}`,
                    )}
                  </button>
                );
              })}
            </div>

            {source === "file" ? (
              picked ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface-1 px-5 py-6 text-center">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-surface-3 text-muted-foreground">
                    <FileImage className="size-5" />
                  </span>
                  <div className="w-full min-w-0">
                    <Hint content={picked.name} variant="text" truncatedOnly>
                      <p className="truncate text-sm font-medium">
                        {picked.name}
                      </p>
                    </Hint>
                    <Hint content={picked.path} variant="text" truncatedOnly>
                      <p className="truncate font-mono text-[10px] text-faint">
                        {picked.path}
                      </p>
                    </Hint>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void pickFile()}
                    >
                      {t("manageSkins.pickAnother")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => setPicked(null)}
                    >
                      <X />
                      {t("manageSkins.clearFile")}
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void pickFile()}
                  disabled={busy}
                  className={cn(
                    "flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-surface-1 px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-surface-3",
                    busy && "pointer-events-none opacity-60",
                  )}
                >
                  <Upload className="size-6 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {t("manageSkins.dropPng")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("manageSkins.dropPngHint")}
                  </span>
                  <span className="mt-1 inline-flex items-center gap-1 text-xs text-faint">
                    <ClipboardPaste className="size-3" />
                    {t("manageSkins.pasteHint")}
                  </span>
                </button>
              )
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface-1 px-5 py-6 text-center">
                <span className="flex size-11 items-center justify-center rounded-xl bg-surface-3 text-muted-foreground">
                  {source === "nick" ? (
                    <User className="size-5" />
                  ) : (
                    <LinkIcon className="size-5" />
                  )}
                </span>
                <p className="text-sm font-medium">
                  {t(
                    source === "nick"
                      ? "manageSkins.nickTitle"
                      : "manageSkins.linkTitle",
                  )}
                </p>
                <Input
                  autoFocus
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  disabled={busy || isOffline}
                  maxLength={source === "nick" ? 16 : undefined}
                  className="max-w-72 text-center"
                  placeholder={
                    source === "nick" ? "Notch" : "https://…/skin.png"
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && canSubmit) void submit();
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {source === "nick"
                    ? t("manageSkins.nickHint")
                    : t("manageSkins.linkHint")}
                </p>
              </div>
            )}

            {isOffline ? (
              <p className="flex items-center gap-1.5 text-xs text-warning">
                <WifiOff className="size-3.5 shrink-0" />
                {t("manageSkins.addOffline")}
              </p>
            ) : preview.state === "error" ? (
              <p className="flex items-start gap-1.5 text-xs text-destructive">
                <TriangleAlert className="mt-px size-3.5 shrink-0" />
                {t(`manageSkins.texture.${preview.reason}`)}
              </p>
            ) : preview.state === "loading" ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 shrink-0 animate-spin" />
                {t("manageSkins.reading")}
              </p>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <SkinStage
              className="min-h-[224px] flex-1"
              skinUrl={stageSkinUrl}
              capeUrl={stageCapeUrl}
              model={preview.state === "ready" ? (preview.model ?? "auto") : "auto"}
              minHeight={200}
              badges={
                isPlaceholder && stageSkinUrl ? (
                  <Badge variant="outline" className="bg-surface-1/80">
                    {t("manageSkins.previewCurrent")}
                  </Badge>
                ) : null
              }
              overlay={
                preview.state === "loading" ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-surface-1/70">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </span>
                ) : null
              }
            />

            <div className="flex min-h-8 shrink-0 flex-wrap items-center justify-center gap-1.5">
              {preview.state === "ready" ? (
                <>
                  <Badge variant="outline" className="font-mono tabular-nums">
                    {preview.info.width}×{preview.info.height}
                  </Badge>
                  {preview.info.legacy ? (
                    <Badge
                      variant="outline"
                      className="border-warning/40 text-warning"
                    >
                      {t("manageSkins.legacyFormat")}
                    </Badge>
                  ) : null}
                  {preview.model ? (
                    <Hint content={t("manageSkins.detectedModel")}>
                      <Badge variant="secondary">
                        {preview.model === "slim"
                          ? t("manageSkins.slim")
                          : t("manageSkins.classic")}
                      </Badge>
                    </Hint>
                  ) : null}
                </>
              ) : (
                <p className="text-center text-xs text-muted-foreground">
                  {source === "nick"
                    ? t("manageSkins.nickNoPreview")
                    : t("manageSkins.previewHint")}
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={!canSubmit}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />}
            {t("common.add")}
          </Button>
        </DialogFooter>

        {isDragOver ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-primary-veil text-sm font-medium">
            <Upload className="size-6" />
            {t("manageSkins.dropAnywhere")}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
