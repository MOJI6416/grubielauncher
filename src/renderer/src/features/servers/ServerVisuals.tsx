import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { MotdSpan, motdColorVariable, motdLines } from "./motd";
import { latencyBars, latencyTone } from "./ping";
import { serverIconDataUrl } from "./serverIcon";

const TONE_CLASS = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
} as const;

export function ServerFavicon({
  icon,
  size = 32,
  className,
}: {
  icon?: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [icon]);

  const source = serverIconDataUrl(icon);

  return (
    <span
      style={{ width: size, height: size }}
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-3 text-faint",
        className,
      )}
    >
      {source && !failed ? (
        <img
          src={source}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Globe style={{ width: size * 0.45, height: size * 0.45 }} />
      )}
    </span>
  );
}

export function MotdText({
  spans,
  lines = 1,
  className,
}: {
  spans: MotdSpan[];
  lines?: 1 | 2;
  className?: string;
}) {
  if (!spans.length) return null;

  const rows = motdLines(spans).slice(0, lines);

  return (
    <span className={cn("block min-w-0", className)}>
      {rows.map((row, rowIndex) => (
        <span key={rowIndex} className="block min-w-0 truncate">
          {row.map((span, index) => (
            <span
              key={index}
              style={{ color: motdColorVariable(span.color) }}
              className={cn(
                span.bold && "font-semibold",
                span.italic && "italic",
                span.underline && "underline",
                span.strikethrough && "line-through",
              )}
            >
              {span.text}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

export function PingBars({
  latencyMs,
  offline,
  className,
}: {
  latencyMs?: number;
  offline?: boolean;
  className?: string;
}) {
  const bars = offline ? 0 : latencyBars(latencyMs);
  const tone = TONE_CLASS[latencyTone(latencyMs)];

  return (
    <span className={cn("flex items-end gap-[2px]", className)} aria-hidden>
      {[0, 1, 2, 3, 4].map((index) => (
        <span
          key={index}
          style={{ height: 4 + index * 2 }}
          className={cn(
            "w-[3px] rounded-[1px]",
            index < bars ? tone : "bg-surface-3",
          )}
        />
      ))}
    </span>
  );
}

export function StatusDot({
  state,
  className,
}: {
  state: "pending" | "online" | "offline";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        state === "online"
          ? "bg-success"
          : state === "pending"
            ? "animate-pulse bg-warning"
            : "bg-faint",
        className,
      )}
    />
  );
}
