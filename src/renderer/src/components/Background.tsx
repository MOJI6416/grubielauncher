import type { ReactNode } from "react";
import {
  backdropUrl,
  useActiveTheme,
} from "@renderer/features/theme/themesStore";

export function Background({ children }: { children: ReactNode }) {
  const backdrop = useActiveTheme().backdrop;

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 text-foreground"
      >
        {backdrop && (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `url("${backdropUrl(backdrop.path)}")`,
                filter: backdrop.blur ? `blur(${backdrop.blur}px)` : undefined,
                transform: backdrop.blur ? "scale(1.06)" : undefined,
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background: `color-mix(in oklab, var(--background) ${backdrop.dim}%, transparent)`,
              }}
            />
          </>
        )}
        <div className="absolute inset-0 bg-[radial-gradient(52rem_24rem_at_22%_-7rem,color-mix(in_oklab,var(--primary)_11%,transparent),transparent_66%),radial-gradient(40rem_22rem_at_96%_118%,color-mix(in_oklab,var(--primary)_5%,transparent),transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] opacity-[0.04] [background-size:44px_44px] [mask-image:linear-gradient(180deg,#000_0%,rgb(0_0_0_/_0.5)_22%,transparent_72%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_0%,color-mix(in_oklab,var(--background)_66%,transparent)_78%)]" />
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}
