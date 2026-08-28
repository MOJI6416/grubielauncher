import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import minecraftFontUrl from "skinview3d/assets/minecraft.woff2";
import { ISkinData } from "@/types/Skin";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SkinStage } from "@renderer/features/skins/SkinStage";

let minecraftFontPromise: Promise<void> | null = null;

function ensureMinecraftFont(): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) {
    return Promise.resolve();
  }

  if (!minecraftFontPromise) {
    const face = new FontFace(
      "Minecraft",
      `url(${minecraftFontUrl}) format("woff2")`,
    );
    document.fonts.add(face);
    minecraftFontPromise = face
      .load()
      .then(() => undefined)
      .catch(() => undefined);
  }

  return minecraftFontPromise;
}

void ensureMinecraftFont();

export function SkinView({
  skinData,
  onClose,
  nickname,
}: {
  skinData: ISkinData;
  nickname?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [isFontReady, setIsFontReady] = useState(
    () =>
      typeof document !== "undefined" &&
      "fonts" in document &&
      document.fonts.check("16px Minecraft"),
  );

  useEffect(() => {
    if (isFontReady) return;

    let cancelled = false;
    void ensureMinecraftFont().finally(() => {
      if (!cancelled) setIsFontReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [isFontReady]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="truncate">
            {nickname ?? t("skinView.title")}
          </DialogTitle>
        </DialogHeader>

        {isFontReady ? (
          <SkinStage
            className="h-[420px]"
            skinUrl={skinData.skin}
            capeUrl={skinData.cape}
            nickname={nickname}
            minHeight={360}
          />
        ) : (
          <div className="flex h-[420px] items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
