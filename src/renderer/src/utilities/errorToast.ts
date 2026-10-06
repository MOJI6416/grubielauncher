import { toast } from "sonner";
import { getDefaultStore } from "jotai";
import { errorLogAtom } from "../stores/atoms";
import { copyWithFeedback } from "./copyFeedback";
import { uiJournal } from "./journal";
import { isStreamerActive } from "@renderer/features/streamer/streamerMode";
import { redactText } from "@renderer/features/streamer/redact";

const ERROR_LOG_LIMIT = 50;

export function recordError(
  title: string,
  details?: string,
  crashKey?: string,
) {
  uiJournal.warn("error-shown", title, {
    details: details?.slice(0, 4000),
    crashKey,
  });
  const store = getDefaultStore();
  store.set(errorLogAtom, (prev) =>
    [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        time: Date.now(),
        title,
        details,
        crashKey,
      },
      ...prev,
    ].slice(0, ERROR_LOG_LIMIT),
  );
}

export function showErrorToast(
  title: string,
  details: string | undefined,
  copyLabel: string,
  toastId?: string | number,
  technical?: string,
) {
  const fullDetails = [details, technical].filter(Boolean).join("\n\n");
  recordError(title, fullDetails || undefined);

  toast.error(title, {
    id: toastId,
    description: details
      ? isStreamerActive()
        ? redactText(details)
        : details
      : undefined,
    duration: 12000,
    ...(fullDetails && copyLabel
      ? {
          action: {
            label: copyLabel,
            onClick: () => {
              void copyWithFeedback(`${title}\n${fullDetails}`);
            },
          },
        }
      : {}),
  });
}
