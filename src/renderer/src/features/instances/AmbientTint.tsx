import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { selectedVersionAtom } from "@renderer/stores/atoms";
import { resolveLocalImage } from "@renderer/utilities/localMedia";
import { pickArtTint } from "./artTint";

const SAMPLE_SIZE = 24;
const LOADER_TOKENS = new Set(["forge", "neoforge", "fabric", "quilt", "vanilla"]);
const tintCache = new Map<string, string | null>();

function sampleTint(source: string): Promise<string | null> {
  const cached = tintCache.get(source);
  if (cached !== undefined) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      let tint: string | null = null;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (context) {
          context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
          tint = pickArtTint(
            context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data,
          );
        }
      } catch {
        tint = null;
      }
      tintCache.set(source, tint);
      resolve(tint);
    };
    image.onerror = () => {
      tintCache.set(source, null);
      resolve(null);
    };
    image.src = source;
  });
}

export function AmbientTint() {
  const selected = useAtomValue(selectedVersionAtom);
  const source = resolveLocalImage(selected?.version.image);
  const loader = selected?.version.loader.name ?? "";
  const [tint, setTint] = useState<string | null>(null);

  useEffect(() => {
    if (!source) {
      setTint(null);
      return;
    }

    let cancelled = false;
    void sampleTint(source).then((value) => {
      if (!cancelled) setTint(value);
    });

    return () => {
      cancelled = true;
    };
  }, [source]);

  const fallback = selected
    ? `var(--loader-${LOADER_TOKENS.has(loader) ? loader : "vanilla"})`
    : "transparent";

  return (
    <div
      aria-hidden
      className="ambient-tint absolute inset-0 -z-10"
      style={{ ["--art-tint" as string]: tint ?? fallback }}
    />
  );
}
