import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { versionsLoadedAtom } from "@renderer/stores/atoms";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { showFailureToast } from "@renderer/utilities/failures";
import { useBytesFormatter } from "@renderer/features/dataLocation/useDataLocationChooser";
import { countFeature } from "@renderer/features/usage/usage";

const api = window.api;
const TOAST_ID = "data-move-dedupe";
const OFFER_MS = 60_000;

let offered = false;

export function DataMoveHost() {
  const { t } = useTranslation();
  const versionsLoaded = useAtomValue(versionsLoadedAtom);
  const bytes = useBytesFormatter();

  useEffect(() => {
    if (!versionsLoaded || offered) return;
    offered = true;

    const merge = async () => {
      countFeature("storage.cleanup");
      toast.loading(t("dataLocation.dedupeOffer.running"), { id: TOAST_ID });
      try {
        const result = await api.storage.cleanup("dedupe");
        if (result.blocked) {
          toast.error(t("settings.storage.busy"), { id: TOAST_ID });
          return;
        }
        if (result.failed) throw new Error("dedupe failed");
        toast.success(
          t("settings.storage.cleared", { size: bytes(result.freed) }),
          { id: TOAST_ID },
        );
        if (result.unsupported) {
          toast.warning(t("settings.storage.dedupeUnsupported"));
        }
      } catch (error) {
        toast.dismiss(TOAST_ID);
        showFailureToast(t("settings.storage.actionFailed"), error, {
          channels: ["storage:"],
          fallbackDescription: t("settings.storage.actionFailedHint"),
        });
      }
    };

    void api.dataLocation
      .get()
      .then((info) => {
        if (!info.movedAcrossDrives) return;
        toast(t("dataLocation.dedupeOffer.title"), {
          id: TOAST_ID,
          description: t("dataLocation.dedupeOffer.description"),
          duration: OFFER_MS,
          action: {
            label: t("dataLocation.dedupeOffer.action"),
            onClick: () => void merge(),
          },
        });
      })
      .catch(ignoreFailure);
  }, [bytes, t, versionsLoaded]);

  return null;
}
