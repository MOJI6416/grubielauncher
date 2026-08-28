import { useState } from "react";
import { cn } from "@/lib/utils";
import { resolveLocalImage } from "@renderer/utilities/localMedia";

const LOADER_TINT: Record<string, string> = {
  vanilla: "from-loader-vanilla/25",
  forge: "from-loader-forge/25",
  neoforge: "from-loader-neoforge/25",
  fabric: "from-loader-fabric/25",
  quilt: "from-loader-quilt/25",
};

export function loaderTint(loader?: string): string {
  return LOADER_TINT[loader ?? ""] ?? LOADER_TINT.vanilla;
}

export function instanceInitials(name: string): string {
  const letters = name.replace(/[^\p{L}\p{N}]/gu, "");
  return (letters.slice(0, 2) || name.trim().slice(0, 2)).toUpperCase();
}

export function InstanceArt({
  name,
  image,
  className,
  textClassName,
  eager,
}: {
  name: string;
  image?: string | null;
  className?: string;
  textClassName?: string;
  eager?: boolean;
}) {
  const source = resolveLocalImage(image);
  const [brokenSource, setBrokenSource] = useState("");

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden bg-surface-3 select-none",
        className,
      )}
    >
      {source && source !== brokenSource ? (
        <img
          src={source}
          alt=""
          draggable={false}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onError={() => setBrokenSource(source)}
          className="size-full object-cover"
        />
      ) : (
        <span className={cn("font-semibold text-faint", textClassName)}>
          {instanceInitials(name)}
        </span>
      )}
    </span>
  );
}
