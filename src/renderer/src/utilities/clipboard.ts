import i18n from "@renderer/i18n";
import { showFailureToast } from "./failures";

export async function copyToClipboard(text: string): Promise<boolean> {
  const copied = await window.api.clipboard
    .writeText(text)
    .catch(() => false as boolean);

  if (copied) return true;

  showFailureToast(i18n.t("common.copyFailed"), undefined, {
    channels: ["clipboard:writeText"],
    fallbackDescription: i18n.t("common.copyFailedHint"),
    withCopy: false,
  });

  return false;
}
