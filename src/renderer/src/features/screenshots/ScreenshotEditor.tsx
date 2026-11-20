import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Crop,
  EyeOff,
  Loader2,
  RotateCcw,
  ScanText,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { SegmentedControl } from "@renderer/components/SegmentedControl";
import { showFailureToast } from "@renderer/utilities/failures";
import { countFeature } from "@renderer/features/usage/usage";
import { bumpInstanceDataRevision } from "@renderer/features/instances/instanceRevision";
import { screenshotLabel } from "@renderer/features/instances/instanceOverview";
import {
  type ChatTarget,
  handOffToChat,
} from "@renderer/features/friends/chatHandoff";
import { MAX_CHAT_IMAGE_BYTES } from "@renderer/features/friends/chatAttachments";
import {
  type Point,
  type Rect,
  type Size,
  blurBlock,
  debugScreenRect,
  editedName,
  intoCrop,
  isUsableRect,
  outputSize,
  pixelate,
  rectFromPoints,
} from "./imageEdits";
import { RecipientPicker } from "./RecipientPicker";

const api = window.api;

export type EditorMode = "send" | "edit";
type Tool = "blur" | "crop";

export interface EditorShot {
  path: string;
  name: string;
  folder: string;
}

function fit(image: Size, box: Size): Size {
  if (!image.width || !image.height || !box.width || !box.height) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(box.width / image.width, box.height / image.height, 1);
  return {
    width: Math.floor(image.width * scale),
    height: Math.floor(image.height * scale),
  };
}

function scaled(rect: Rect, ratio: number): Rect {
  return {
    x: Math.round(rect.x * ratio),
    y: Math.round(rect.y * ratio),
    w: Math.max(1, Math.round(rect.w * ratio)),
    h: Math.max(1, Math.round(rect.h * ratio)),
  };
}

function blurInto(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  rect: Rect,
  block: number,
) {
  if (rect.w < 1 || rect.h < 1) return;
  const pixels = context.getImageData(rect.x, rect.y, rect.w, rect.h);
  pixelate(pixels.data, rect.w, rect.h, { x: 0, y: 0, w: rect.w, h: rect.h }, block);
  context.putImageData(pixels, rect.x, rect.y);
}

async function renderOutput(
  bitmap: ImageBitmap,
  crop: Rect | null,
  blurs: Rect[],
): Promise<Blob> {
  const natural = { width: bitmap.width, height: bitmap.height };
  const usableCrop = isUsableRect(crop) ? crop : null;
  const size = outputSize(natural, usableCrop);
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("canvas 2d context unavailable");

  context.drawImage(
    bitmap,
    usableCrop?.x ?? 0,
    usableCrop?.y ?? 0,
    size.width,
    size.height,
    0,
    0,
    size.width,
    size.height,
  );

  for (const blur of blurs) {
    const local = intoCrop(blur, usableCrop);
    if (local) blurInto(context, local, blurBlock(blur, natural.width));
  }

  const png = await canvas.convertToBlob({ type: "image/png" });
  if (png.size <= MAX_CHAT_IMAGE_BYTES - 1024 * 1024) return png;
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
}

export function ScreenshotEditor({
  shot,
  mode,
  onClose,
}: {
  shot: EditorShot;
  mode: EditorMode;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tool, setTool] = useState<Tool>("blur");
  const [crop, setCrop] = useState<Rect | null>(null);
  const [blurs, setBlurs] = useState<Rect[]>([]);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [recipient, setRecipient] = useState<ChatTarget | null>(null);
  const [isBusy, setBusy] = useState(false);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState<Size>({ width: 0, height: 0 });
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const startRef = useRef<Point | null>(null);
  const history = useRef<
    ({ kind: "blur" } | { kind: "crop"; previous: Rect | null })[]
  >([]);

  useEffect(() => {
    let alive = true;
    let loaded: ImageBitmap | null = null;

    void (async () => {
      try {
        const bytes = await api.fs.readFileBuffer(shot.path);
        if (!bytes) throw new Error("screenshot unreadable");
        loaded = await createImageBitmap(new Blob([bytes.slice().buffer]));
        if (alive) setBitmap(loaded);
        else loaded.close();
      } catch (error) {
        if (!alive) return;
        setLoadFailed(true);
        showFailureToast(t("versions.screenshots.loadFailed"), error, {
          channels: ["fs:readFileBuffer"],
        });
      }
    })();

    return () => {
      alive = false;
      loaded?.close();
    };
  }, [shot.path, t]);

  useEffect(() => {
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      setBox({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [stage]);

  const natural = useMemo<Size>(
    () => ({ width: bitmap?.width ?? 0, height: bitmap?.height ?? 0 }),
    [bitmap],
  );
  const display = fit(natural, box);
  const ratio = natural.width ? display.width / natural.width : 0;

  useEffect(() => {
    if (!canvas || !bitmap || !display.width) return;
    const density = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(display.width * density);
    const height = Math.round(display.height * density);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);

    const previewRatio = width / natural.width;
    const regions = tool === "blur" && draft ? [...blurs, draft] : blurs;
    for (const region of regions) {
      if (!isUsableRect(region)) continue;
      blurInto(
        context,
        scaled(region, previewRatio),
        Math.max(2, Math.round(blurBlock(region, natural.width) * previewRatio)),
      );
    }
  }, [bitmap, blurs, canvas, display.height, display.width, draft, natural.width, tool]);

  const toImage = useCallback(
    (event: ReactPointerEvent<HTMLElement>): Point => {
      const bounds = event.currentTarget.getBoundingClientRect();
      return {
        x: ((event.clientX - bounds.left) / bounds.width) * natural.width,
        y: ((event.clientY - bounds.top) / bounds.height) * natural.height,
      };
    },
    [natural.height, natural.width],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!bitmap || isBusy || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    startRef.current = toImage(event);
    setDraft(null);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    if (!start) return;
    setDraft(rectFromPoints(start, toImage(event), natural));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = startRef.current;
    startRef.current = null;
    if (!start) return;
    const rect = rectFromPoints(start, toImage(event), natural);
    setDraft(null);
    if (!isUsableRect(rect)) return;

    if (tool === "crop") {
      history.current.push({ kind: "crop", previous: crop });
      setCrop(rect);
    } else {
      setBlurs((list) => [...list, rect]);
      history.current.push({ kind: "blur" });
    }
  };

  const undo = () => {
    const last = history.current.pop();
    if (last?.kind === "blur") setBlurs((list) => list.slice(0, -1));
    if (last?.kind === "crop") setCrop(last.previous);
  };

  const reset = () => {
    history.current = [];
    setCrop(null);
    setBlurs([]);
  };

  const hideDebug = () => {
    if (!bitmap) return;
    setBlurs((list) => [...list, debugScreenRect(natural)]);
    history.current.push({ kind: "blur" });
  };

  const hasEdits = blurs.length > 0 || isUsableRect(crop);

  const submit = async () => {
    if (!bitmap || isBusy) return;
    if (mode === "send" && !recipient) return;
    setBusy(true);

    try {
      const blob = await renderOutput(bitmap, crop, blurs);

      if (mode === "send" && recipient) {
        const extension = blob.type === "image/jpeg" ? "jpg" : "png";
        const base = shot.name.replace(/\.[^.]+$/, "");
        const file = new File([blob], `${base}.${extension}`, { type: blob.type });
        countFeature("screenshots.send");
        onClose();
        handOffToChat(recipient, [file]);
        return;
      }

      const existing = await api.fs.readdir(shot.folder);
      const name = editedName(shot.name, existing);
      const target = api.path.join(shot.folder, name);
      const saved = await api.fs.writeFile(
        target,
        new Uint8Array(await blob.arrayBuffer()),
      );
      if (!saved) throw new Error("fs:writeFile returned false");

      countFeature("screenshots.edit");
      bumpInstanceDataRevision();
      toast.success(t("screenshots.editor.saved"), {
        description: name,
        action: {
          label: t("versions.screenshots.showInFolder"),
          onClick: () => void api.shell.showItemInFolder(target),
        },
      });
      onClose();
    } catch (error) {
      showFailureToast(
        mode === "send"
          ? t("screenshots.send.failed")
          : t("screenshots.editor.saveFailed"),
        error,
        { channels: ["fs:writeFile", "fs:readdir"] },
      );
    } finally {
      setBusy(false);
    }
  };

  const shownCrop = tool === "crop" && draft ? draft : crop;
  const cropBox = shownCrop && isUsableRect(shownCrop) ? scaled(shownCrop, ratio) : null;
  const blockedReason =
    mode === "send" && !recipient ? t("screenshots.send.pickRecipient") : "";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isBusy) onClose();
      }}
    >
      <DialogContent className="flex max-h-[calc(100vh-48px)] flex-col gap-3 sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "send"
              ? t("screenshots.send.title")
              : t("screenshots.editor.title")}
          </DialogTitle>
          <DialogDescription className="truncate">
            {screenshotLabel(shot.name)}
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            "grid min-h-0 flex-1 gap-3",
            mode === "send" ? "grid-cols-[minmax(0,1fr)_15rem]" : "grid-cols-1",
          )}
        >
          <div className="flex min-h-0 min-w-0 flex-col gap-2">
            <div className="flex shrink-0 items-center gap-2">
              <SegmentedControl
                value={tool}
                ariaLabel={t("screenshots.editor.tool")}
                onChange={setTool}
                options={[
                  {
                    value: "blur",
                    label: t("screenshots.editor.blur"),
                    icon: <EyeOff className="size-3.5" />,
                  },
                  {
                    value: "crop",
                    label: t("screenshots.editor.crop"),
                    icon: <Crop className="size-3.5" />,
                  },
                ]}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                disabled={!bitmap || isBusy}
                onClick={hideDebug}
              >
                <ScanText className="size-3.5" />
                {t("screenshots.editor.hideDebug")}
              </Button>
              <div className="ml-auto flex items-center gap-1">
                <Hint content={t("screenshots.editor.undo")}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-8"
                    aria-label={t("screenshots.editor.undo")}
                    disabled={!hasEdits || isBusy}
                    onClick={undo}
                  >
                    <Undo2 className="size-3.5" />
                  </Button>
                </Hint>
                <Hint content={t("screenshots.editor.reset")}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-8"
                    aria-label={t("screenshots.editor.reset")}
                    disabled={!hasEdits || isBusy}
                    onClick={reset}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                </Hint>
              </div>
            </div>

            <div
              ref={setStage}
              className="flex h-[min(56vh,420px)] min-h-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-1"
            >
              {loadFailed ? (
                <p className="px-6 text-center text-sm text-muted-foreground">
                  {t("versions.screenshots.loadFailed")}
                </p>
              ) : !bitmap || !display.width ? (
                <Skeleton className="size-full rounded-none" />
              ) : (
                <div
                  className="relative cursor-crosshair touch-none select-none"
                  style={{ width: display.width, height: display.height }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={() => {
                    startRef.current = null;
                    setDraft(null);
                  }}
                >
                  <canvas
                    ref={setCanvas}
                    className="block size-full"
                    aria-label={screenshotLabel(shot.name)}
                  />
                  {blurs.map((rect, index) => {
                    const box = scaled(rect, ratio);
                    return (
                      <span
                        key={index}
                        className="pointer-events-none absolute border border-dashed border-info"
                        style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
                      />
                    );
                  })}
                  {tool === "blur" && draft && isUsableRect(draft) && (
                    <span
                      className="pointer-events-none absolute border border-info"
                      style={(() => {
                        const box = scaled(draft, ratio);
                        return { left: box.x, top: box.y, width: box.w, height: box.h };
                      })()}
                    />
                  )}
                  {cropBox && (
                    <>
                      <span
                        className="pointer-events-none absolute inset-x-0 top-0 bg-scrim"
                        style={{ height: cropBox.y }}
                      />
                      <span
                        className="pointer-events-none absolute inset-x-0 bottom-0 bg-scrim"
                        style={{ top: cropBox.y + cropBox.h }}
                      />
                      <span
                        className="pointer-events-none absolute left-0 bg-scrim"
                        style={{ top: cropBox.y, height: cropBox.h, width: cropBox.x }}
                      />
                      <span
                        className="pointer-events-none absolute right-0 bg-scrim"
                        style={{
                          top: cropBox.y,
                          height: cropBox.h,
                          left: cropBox.x + cropBox.w,
                        }}
                      />
                      <span
                        className="pointer-events-none absolute border-2 border-foreground"
                        style={{
                          left: cropBox.x,
                          top: cropBox.y,
                          width: cropBox.w,
                          height: cropBox.h,
                        }}
                      />
                    </>
                  )}
                </div>
              )}
            </div>

            <p className="shrink-0 text-2xs text-faint">
              {tool === "crop"
                ? t("screenshots.editor.cropHint")
                : t("screenshots.editor.blurHint")}
            </p>
          </div>

          {mode === "send" && (
            <aside className="flex min-h-0 flex-col gap-2">
              <p className="shrink-0 text-xs font-medium text-muted-foreground">
                {t("screenshots.send.to")}
              </p>
              <RecipientPicker value={recipient} onChange={setRecipient} />
            </aside>
          )}
        </div>

        <DialogFooter className="items-center gap-2">
          {blockedReason && (
            <span className="mr-auto text-xs text-muted-foreground">
              {blockedReason}
            </span>
          )}
          <Button variant="secondary" disabled={isBusy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!bitmap || isBusy || !!blockedReason}
            onClick={() => void submit()}
          >
            {isBusy && <Loader2 className="animate-spin" />}
            {mode === "send"
              ? t("screenshots.send.submit")
              : t("screenshots.editor.saveCopy")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
