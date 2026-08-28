import { useEffect, useState } from "react";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderSkinHead } from "./skinPixels";

export function SkinHead({
  url,
  size = 36,
  alt,
  className,
}: {
  url?: string | null;
  size?: number;
  alt?: string;
  className?: string;
}) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    if (!url) {
      setSrc("");
      return;
    }

    let cancelled = false;
    void renderSkinHead(url).then((value) => {
      if (!cancelled) setSrc(value);
    });

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!src) {
    return (
      <span
        className={cn(
          "flex items-center justify-center rounded-md bg-surface-3 text-muted-foreground",
          className,
        )}
        style={{ width: size, height: size }}
      >
        <User className="size-1/2" />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt ?? ""}
      width={size}
      height={size}
      className={cn("rounded-md [image-rendering:pixelated]", className)}
      style={{ width: size, height: size }}
    />
  );
}
