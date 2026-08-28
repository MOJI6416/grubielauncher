import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function FormErrorMessage({
  show,
  id,
  children,
  className,
}: {
  show: boolean;
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid overflow-hidden transition-[grid-template-rows,opacity,margin-top] duration-[var(--dur)] ease-swift motion-reduce:transition-none",
        show
          ? "mt-1 grid-rows-[1fr] opacity-100"
          : "mt-0 grid-rows-[0fr] opacity-0",
      )}
      aria-hidden={!show}
    >
      <p
        id={id}
        className={cn(
          "min-h-0 overflow-hidden text-xs leading-5 text-destructive",
          className,
        )}
        aria-live="polite"
      >
        {children}
      </p>
    </div>
  );
}
