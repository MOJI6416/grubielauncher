import { useEffect, useState } from "react";
import { Earth } from "lucide-react";
import { resolveLocalImage } from "@renderer/utilities/localMedia";
import { cn } from "@/lib/utils";

export function WorldIcon({
  icon,
  size,
  className,
  iconClassName,
}: {
  icon?: string;
  size: number;
  className?: string;
  iconClassName?: string;
}) {
  const src = icon ? resolveLocalImage(icon) : "";
  const [isBroken, setIsBroken] = useState(false);

  useEffect(() => {
    setIsBroken(false);
  }, [src]);

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden border bg-surface-3 text-faint",
        className,
      )}
    >
      {src && !isBroken ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => setIsBroken(true)}
        />
      ) : (
        <Earth className={iconClassName} />
      )}
    </span>
  );
}
