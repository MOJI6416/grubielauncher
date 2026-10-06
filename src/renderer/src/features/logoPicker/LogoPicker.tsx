import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Popover, PopoverContent } from "@/components/ui/popover";
import {
  lazyWithPreload,
  schedulePreload,
} from "@renderer/utilities/lazyPreload";

const LazyLogoPickerBody = lazyWithPreload(() =>
  import("./LogoPickerBody").then((module) => ({
    default: module.LogoPickerBody,
  })),
);

export function LogoPicker({
  children,
  outputSize = 256,
  hasImage,
  onApply,
  onPickFile,
  onRemove,
}: {
  children: ReactNode;
  outputSize?: number;
  hasImage: boolean;
  onApply: (blob: Blob) => void;
  onPickFile: () => void;
  onRemove?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      schedulePreload([
        LazyLogoPickerBody.preload,
        () =>
          import("./texturePack").then((module) => module.preloadTexturePack()),
      ]),
    [],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {children}
      <PopoverContent
        ref={contentRef}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus();
        }}
        align="start"
        collisionPadding={12}
        className="w-[372px] p-0"
      >
        <Suspense fallback={<div className="h-[450px]" />}>
          <LazyLogoPickerBody
            outputSize={outputSize}
            hasImage={hasImage}
            onApply={onApply}
            onPickFile={() => {
              setOpen(false);
              onPickFile();
            }}
            onRemove={
              onRemove &&
              (() => {
                setOpen(false);
                onRemove();
              })
            }
          />
        </Suspense>
      </PopoverContent>
    </Popover>
  );
}
