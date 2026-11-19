import type { TFunction } from "i18next";
import type { ShareTransport } from "@/types/Share";
import { Hint } from "@renderer/components/Hint";
import { cn } from "@/lib/utils";
import { formatRtt, transportHintKey, transportLabelKey } from "./guestLinks";

export function TransportBadge({
  transport,
  rttMs,
  t,
  className,
}: {
  transport: ShareTransport;
  rttMs?: number;
  t: TFunction;
  className?: string;
}) {
  const label = t(transportLabelKey(transport));
  const rtt = formatRtt(rttMs, t("servers.ms"));
  const text = rtt ? `${label} · ${rtt}` : label;

  return (
    <Hint content={t(transportHintKey(transport))}>
      <span
        className={cn(
          "shrink-0 font-mono text-2xs whitespace-nowrap tabular-nums",
          transport === "relay" ? "text-faint" : "text-success",
          className,
        )}
      >
        {text}
      </span>
    </Hint>
  );
}
