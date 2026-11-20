import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { ArrowUpCircle, BadgePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { showFailureToast } from "@renderer/utilities/failures";
import {
  openReleaseNotesFor,
  whatsNewLoadingAtom,
} from "@renderer/features/whatsNew/whatsNewStore";
import { useAppUpdateInstall } from "./useAppUpdateInstall";

export function UpdatePill() {
  const { t } = useTranslation();
  const { version, block, inCall, isInstalling, install } =
    useAppUpdateInstall();
  const isNotesLoading = useAtomValue(whatsNewLoadingAtom);

  if (!version) return null;

  const showNotes = async () => {
    try {
      if (await openReleaseNotesFor(version)) return;
      showFailureToast(t("appUpdate.notesUnavailable"), undefined, {
        channels: ["backend:getWhatsNew"],
        fallbackDescription: t("appUpdate.notesUnavailableHint"),
      });
    } catch (error) {
      showFailureToast(t("appUpdate.notesUnavailable"), error, {
        channels: ["backend:getWhatsNew"],
      });
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mr-1.5 flex h-7 shrink-0 items-center gap-1.5 rounded-lg bg-warning/15 px-2 text-xs font-medium whitespace-nowrap text-foreground transition-colors hover:bg-warning/25"
        >
          <ArrowUpCircle className="size-3.5 text-warning" />
          {t("appUpdate.pill", { version })}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3.5" collisionPadding={12}>
        <p className="text-sm font-medium text-foreground">
          {t("appUpdate.title", { version })}
        </p>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          {t("appUpdate.description")}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-1.5 -ml-2 h-7 px-2 text-xs text-muted-foreground"
          disabled={isNotesLoading}
          onClick={() => void showNotes()}
        >
          {isNotesLoading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <BadgePlus className="size-3.5" />
          )}
          {t("appUpdate.whatsNew", { version })}
        </Button>
        {(block || inCall) && (
          <p className="mt-1 text-xs leading-snug text-warning">
            {block ? t(`appUpdate.blocked.${block}`) : t("appUpdate.callWarning")}
          </p>
        )}
        <Button
          className="mt-3 w-full"
          disabled={Boolean(block) || isInstalling}
          onClick={() => void install()}
        >
          {isInstalling ? (
            <Loader2 className="animate-spin" />
          ) : (
            <ArrowUpCircle />
          )}
          {t("appUpdate.install")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
