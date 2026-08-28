import { ReactNode, useEffect, useState } from "react";
import { Package } from "lucide-react";

export function ProjectIcon({
  src,
  size,
  fallback,
}: {
  src: string | null | undefined;
  size: number;
  fallback?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return <>{fallback ?? <Package className="size-4" />}</>;
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className="size-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}
