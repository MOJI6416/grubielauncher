import { CircleCheck, CircleSlash, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import type { TFunction } from "i18next";
import { cn } from "@/lib/utils";
import type { SessionState } from "./session";

const TONE: Record<SessionState, string> = {
  offline: "text-faint",
  active: "text-success",
  renewable: "text-warning",
  expiring: "text-warning",
  expired: "text-destructive",
};

export function sessionLabel(state: SessionState, t: TFunction): string {
  return t(`accounts.session.${state}`);
}

export function SessionIcon({
  state,
  busy,
  className,
}: {
  state: SessionState;
  busy?: boolean;
  className?: string;
}) {
  if (busy) {
    return (
      <Loader2 className={cn("size-3.5 animate-spin text-warning", className)} />
    );
  }

  const tone = TONE[state];

  if (state === "offline")
    return <CircleSlash className={cn("size-3.5", tone, className)} />;
  if (state === "active")
    return <CircleCheck className={cn("size-3.5", tone, className)} />;
  if (state === "renewable")
    return <RefreshCw className={cn("size-3.5", tone, className)} />;

  return <TriangleAlert className={cn("size-3.5", tone, className)} />;
}

export function SessionDot({
  state,
  className,
}: {
  state: SessionState;
  className?: string;
}) {
  const tone =
    state === "active"
      ? "bg-success"
      : state === "expired"
        ? "bg-destructive"
        : state === "offline"
          ? "bg-faint"
          : "bg-warning";

  return (
    <span
      className={cn(
        "size-2 shrink-0 rounded-full ring-2 ring-sidebar",
        tone,
        className,
      )}
    />
  );
}
