import { toast } from "sonner";
import i18n from "@renderer/i18n";

export const UNDO_TOAST_MS = 8000;

export function showUndoToast(
  title: string,
  onUndo: () => void | Promise<void>,
  options: {
    description?: string;
    id?: string | number;
    tone?: "success" | "warning";
    actionLabel?: string;
  } = {},
): string | number {
  const show = options.tone === "warning" ? toast.warning : toast.success;
  return show(title, {
    id: options.id,
    description: options.description,
    duration: UNDO_TOAST_MS,
    action: {
      label: options.actionLabel ?? i18n.t("common.undo"),
      onClick: () => void onUndo(),
    },
  });
}
