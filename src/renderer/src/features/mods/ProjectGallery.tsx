import { IProject } from "@/types/ModManager";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, ImageOff, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export function ProjectGallery({ gallery }: { gallery: IProject["gallery"] }) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;

    let target = el.scrollLeft;
    let raf: number | null = null;

    const step = () => {
      const diff = target - el.scrollLeft;
      if (Math.abs(diff) < 0.5) {
        el.scrollLeft = target;
        raf = null;
        return;
      }
      el.scrollLeft += diff * 0.18;
      raf = requestAnimationFrame(step);
    };

    const onWheel = (event: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;

      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      if (delta === 0) return;

      event.preventDefault();

      const max = el.scrollWidth - el.clientWidth;
      const base = raf === null ? el.scrollLeft : target;
      target = Math.max(0, Math.min(max, base + delta));

      if (raf === null) raf = requestAnimationFrame(step);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, []);

  if (!gallery?.length) return null;

  const openModal = (index: number) => {
    setSelectedIndex(index);
    setModalOpen(true);
  };

  return (
    <>
      <div
        ref={stripRef}
        className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-max gap-2 items-center">
          {gallery.map((image, idx) => (
            <button
              key={idx}
              type="button"
              aria-label={
                image.title ||
                image.description ||
                `${idx + 1}/${gallery.length}`
              }
              className="min-w-[120px] max-w-[120px] cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onClick={() => openModal(idx)}
            >
              <GalleryImage
                src={image.url}
                alt={image.title || image.description || ""}
                className="h-20 w-full rounded-lg border border-border bg-surface-2 object-cover select-none transition-opacity hover:opacity-80"
                frameClassName="flex h-20 w-full items-center justify-center rounded-lg border border-border bg-surface-2 text-faint"
              />
            </button>
          ))}
        </div>
      </div>

      {modalOpen && (
        <ModalGallery
          gallery={gallery}
          startIndex={selectedIndex}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

function ModalGallery({
  gallery,
  startIndex,
  onClose,
}: {
  gallery: IProject["gallery"];
  startIndex: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [current, setCurrent] = useState(startIndex);
  const lastWheelAtRef = useRef(0);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.scrollTo(startIndex, true);
    setCurrent(startIndex);
  }, [emblaApi, startIndex]);

  useEffect(() => {
    if (!emblaApi) return;

    const onSelect = () => {
      setCurrent(emblaApi.selectedScrollSnap());
    };

    emblaApi.on("select", onSelect);
    onSelect();

    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") emblaApi.scrollPrev();
      if (event.key === "ArrowRight") emblaApi.scrollNext();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [emblaApi]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!emblaApi || gallery.length < 2) return;

      event.preventDefault();
      event.stopPropagation();

      const now = Date.now();
      if (now - lastWheelAtRef.current < 180) return;
      lastWheelAtRef.current = now;

      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;

      if (delta > 0) emblaApi.scrollNext();
      else if (delta < 0) emblaApi.scrollPrev();
    },
    [emblaApi, gallery.length],
  );

  return (
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
        className="flex items-center justify-center border-0 bg-transparent p-0 shadow-none"
        onWheel={handleWheel}
      >
        <DialogTitle className="sr-only">{t("common.gallery")}</DialogTitle>

        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={onClose}
          className="absolute top-4 right-4"
          aria-label={t("common.close")}
        >
          <X className="size-4" />
        </Button>

        <div className="absolute top-4 left-4 rounded-lg bg-surface-2 px-3 py-1.5 font-mono text-sm text-muted-foreground select-none">
          {current + 1}/{gallery.length}
        </div>

        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={scrollPrev}
          className="absolute left-6"
          aria-label={t("common.previous")}
        >
          <ChevronLeft className="size-5" />
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={scrollNext}
          className="absolute right-6"
          aria-label={t("common.next")}
        >
          <ChevronRight className="size-5" />
        </Button>

        <div
          className="h-[calc(100%-6rem)] w-[calc(100%-8rem)] max-w-6xl overflow-hidden"
          ref={emblaRef}
        >
          <div className="flex h-full">
            {gallery.map((image, idx) => (
              <div
                key={idx}
                className="flex h-full min-w-full items-center justify-center px-4"
              >
                <GalleryImage
                  src={image.url}
                  alt={image.title || image.description || ""}
                  className="h-full max-h-full w-full max-w-full rounded-xl bg-surface-2 object-contain"
                  frameClassName="flex h-full w-full items-center justify-center rounded-xl bg-surface-2 text-faint"
                />
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GalleryImage({
  src,
  alt,
  className,
  frameClassName,
}: {
  src: string;
  alt: string;
  className: string;
  frameClassName: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed) {
    return (
      <div className={frameClassName}>
        <ImageOff className="size-5" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
