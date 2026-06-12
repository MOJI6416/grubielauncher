import { toast } from "sonner";
import { getDefaultStore } from "jotai";
import { errorLogAtom } from "../stores/atoms";

const api = window.api;
const ERROR_LOG_LIMIT = 50;

export function recordError(title: string, details?: string) {
  const store = getDefaultStore();
  store.set(errorLogAtom, (prev) =>
    [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        time: Date.now(),
        title,
        details,
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
) {
  recordError(title, details);

  toast.error(title, {
    id: toastId,
    description: details || undefined,
    duration: 12000,
    ...(details
      ? {
          action: {
            label: copyLabel,
            onClick: () => {
              void api.clipboard.writeText(`${title}\n${details}`);
            },
          },
        }
      : {}),
  });
}
