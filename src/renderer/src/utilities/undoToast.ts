import { toast } from "sonner";
import i18n from "@renderer/i18n";

export const UNDO_TOAST_MS = 8000;

export function showUndoToast(
  title: string,
  onUndo: () => void | Promise<void>,
  options: { description?: string; id?: string | number } = {},
): string | number {
  return toast.success(title, {
    id: options.id,
    description: options.description,
    duration: UNDO_TOAST_MS,
    action: {
      label: i18n.t("common.undo"),
      onClick: () => void onUndo(),
    },
  });
}
