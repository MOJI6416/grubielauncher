import { IProject } from "@/types/ModManager";
import { RemoteGalleryViewer } from "@renderer/components/mediaViewer/RemoteGalleryViewer";
import { ImageOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export function ProjectGallery({
  gallery,
  title,
}: {
  gallery: IProject["gallery"];
  title?: string;
}) {
  const { t } = useTranslation();
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
        <RemoteGalleryViewer
          images={gallery}
          startIndex={selectedIndex}
          title={title || t("common.gallery")}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
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
