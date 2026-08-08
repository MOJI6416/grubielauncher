import { toast } from "sonner";
import { getDefaultStore } from "jotai";
import { errorLogAtom } from "../stores/atoms";

const api = window.api;
const ERROR_LOG_LIMIT = 50;

export function recordError(
  title: string,
  details?: string,
  crashKey?: string,
) {
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
    description: details || undefined,
    duration: 12000,
    ...(fullDetails
      ? {
          action: {
            label: copyLabel,
            onClick: () => {
              void api.clipboard.writeText(`${title}\n${fullDetails}`);
            },
          },
        }
      : {}),
  });
}
