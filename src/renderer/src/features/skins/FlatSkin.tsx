import { useEffect, useRef, useState } from "react";
import { decodeImagePixels, pixelsToDataUrl } from "./skinPixels";
import {
  inferSkinModel,
  isSupportedSkinSize,
  renderSkinFront,
} from "./skinTexture";

export function FlatSkin({
  skinUrl,
  model = "auto",
  showOuterLayer = true,
  width,
  height,
  minHeight,
  onTextureError,
}: {
  skinUrl?: string;
  model?: "classic" | "slim" | "auto";
  showOuterLayer?: boolean;
  width?: number;
  height?: number;
  minHeight?: number;
  onTextureError?: (kind: "skin" | "cape") => void;
}) {
  const [front, setFront] = useState<{ url: string; source: string } | null>(
    null,
  );
  const onTextureErrorRef = useRef(onTextureError);
  onTextureErrorRef.current = onTextureError;

  useEffect(() => {
    if (!skinUrl) return;

    let cancelled = false;
    void decodeImagePixels(skinUrl).then((image) => {
      if (cancelled) return;
      if (!image || !isSupportedSkinSize(image)) {
        setFront(null);
        onTextureErrorRef.current?.("skin");
        return;
      }

      const resolved = model === "auto" ? inferSkinModel(image) : model;
      setFront({
        source: skinUrl,
        url: pixelsToDataUrl(
          renderSkinFront(image, resolved, { overlay: showOuterLayer }),
        ),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [skinUrl, model, showOuterLayer]);

  const url = front && front.source === skinUrl ? front.url : null;

  return (
    <div
      className="flex size-full min-h-0 min-w-0 items-center justify-center p-6"
      style={{ width, height, minHeight }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          className="size-full object-contain [image-rendering:pixelated] select-none"
        />
      ) : null}
    </div>
  );
}
