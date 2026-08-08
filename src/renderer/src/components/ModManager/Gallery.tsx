import { IProject } from "@/types/ModManager";
import { Button } from "@/components/ui/button";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export default function GalleryCarousel({
  gallery,
}: {
  gallery: IProject["gallery"];
}) {
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
                image.title || image.description || `${idx + 1}/${gallery.length}`
              }
              className="min-w-[120px] max-w-[120px] cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onClick={() => openModal(idx)}
            >
              <img
                src={image.url}
                alt={image.title || image.description || ""}
                className="h-20 w-full rounded-lg border border-border bg-muted/30 object-cover select-none transition-opacity hover:opacity-80"
                loading="lazy"
                draggable={false}
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
  const overlayRef = useRef<HTMLDivElement | null>(null);

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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const previouslyFocused = document.activeElement as HTMLElement | null;
    overlayRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") emblaApi?.scrollPrev();
      if (e.key === "ArrowRight") emblaApi?.scrollNext();

      if (e.key === "Tab") {
        const overlay = overlayRef.current;
        if (!overlay) return;

        const focusable = Array.from(
          overlay.querySelectorAll<HTMLElement>("button"),
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        const isInside = !!active && overlay.contains(active);

        if (e.shiftKey && (!isInside || active === first)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (!isInside || active === last)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [emblaApi, onClose]);

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
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 backdrop-blur-sm focus:outline-none"
      onWheel={handleWheel}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      {/* Offset the top controls below the native window-controls strip
          (titleBarOverlay) so this close button never lands under the OS
          min/max/close. env() is 0px on platforms without Window Controls
          Overlay, so they keep the original top-4 inset. */}
      <Button
        type="button"
        variant="secondary"
        size="icon"
        onClick={onClose}
        className="absolute right-4"
        style={{ top: "calc(env(titlebar-area-height, 0px) + 1rem)" }}
        aria-label={t("common.close")}
      >
        <X className="size-4" />
      </Button>

      <div
        className="absolute left-4 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-white select-none"
        style={{ top: "calc(env(titlebar-area-height, 0px) + 1rem)" }}
      >
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
        className="h-[calc(100vh-6rem)] w-[calc(100vw-8rem)] max-w-6xl overflow-hidden"
        ref={emblaRef}
      >
        <div className="flex h-full">
          {gallery.map((image, idx) => (
            <div
              key={idx}
              className="flex h-full min-w-full items-center justify-center px-4"
            >
              <img
                src={image.url}
                alt={image.title || image.description || ""}
                className="h-full max-h-full w-full max-w-full rounded-xl border border-white/10 bg-black/40 object-contain shadow-2xl"
                loading="lazy"
                draggable={false}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
