import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Layers,
  Play,
  RotateCcw,
  RotateCw,
  Shirt,
  Tag,
  TriangleAlert,
} from "lucide-react";
import type { SkinViewer } from "skinview3d";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import SkinCanvas, { SKIN_ANIMATIONS, SkinAnimation } from "./SkinCanvas";

export function SkinStage({
  skinUrl,
  capeUrl,
  model = "auto",
  nickname,
  className,
  badges,
  overlay,
  minHeight = 220,
  defaultAutoRotate = false,
}: {
  skinUrl?: string;
  capeUrl?: string;
  model?: "classic" | "slim" | "auto";
  nickname?: string;
  className?: string;
  badges?: ReactNode;
  overlay?: ReactNode;
  minHeight?: number;
  defaultAutoRotate?: boolean;
}) {
  const { t } = useTranslation();
  const viewerRef = useRef<SkinViewer | null>(null);

  const [animation, setAnimation] = useState<SkinAnimation>("idle");
  const [autoRotate, setAutoRotate] = useState(defaultAutoRotate);
  const [showOuterLayer, setShowOuterLayer] = useState(true);
  const [backEquipment, setBackEquipment] = useState<"cape" | "elytra">("cape");
  const [showNameTag, setShowNameTag] = useState(false);
  const [failedTexture, setFailedTexture] = useState<"skin" | "cape" | null>(
    null,
  );

  useEffect(() => {
    setAutoRotate(defaultAutoRotate);
  }, [defaultAutoRotate]);

  useEffect(() => {
    setFailedTexture(null);
  }, [skinUrl, capeUrl]);

  const handleReady = useCallback(({ viewer }: { viewer: SkinViewer }) => {
    viewerRef.current = viewer;
  }, []);

  const handleReset = useCallback(() => {
    viewerRef.current?.resetCameraPose();
  }, []);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface-1",
        className,
      )}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <SkinCanvas
          skinUrl={skinUrl}
          capeUrl={capeUrl}
          model={model}
          animation={animation}
          autoRotate={autoRotate}
          autoRotateSpeed={1.2}
          showOuterLayer={showOuterLayer}
          backEquipment={backEquipment}
          nameTag={showNameTag ? (nickname ?? null) : null}
          width={220}
          height={minHeight}
          fillContainer
          onReady={handleReady}
          onTextureError={setFailedTexture}
        />

        {badges ? (
          <div className="pointer-events-none absolute top-2 left-2 flex flex-wrap gap-1">
            {badges}
          </div>
        ) : null}

        {!skinUrl ? (
          <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <Shirt className="size-6" />
            <span className="text-xs">{t("skinStage.noSkin")}</span>
          </span>
        ) : null}

        {failedTexture === "skin" && skinUrl ? (
          <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center text-destructive">
            <TriangleAlert className="size-6" />
            <span className="text-xs">{t("skinStage.textureError_skin")}</span>
          </span>
        ) : null}

        {failedTexture === "cape" && skinUrl ? (
          <span className="pointer-events-none absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-md bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
            <TriangleAlert className="size-3" />
            {t("skinStage.textureError_cape")}
          </span>
        ) : null}

        {overlay}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-center gap-0.5 border-t border-border bg-surface-2 px-1.5 py-1">
        <DropdownMenu>
          <Hint content={t("skinStage.animation")}>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("skinStage.animation")}
              >
                <Play />
              </Button>
            </DropdownMenuTrigger>
          </Hint>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup
              value={animation}
              onValueChange={(value) => setAnimation(value as SkinAnimation)}
            >
              {SKIN_ANIMATIONS.map((value) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  {t(`skinStage.animations.${value}`)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Hint content={t("skinStage.autoRotate")}>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-pressed={autoRotate}
            aria-label={t("skinStage.autoRotate")}
            className={cn(autoRotate && "bg-primary-soft text-foreground")}
            onClick={() => setAutoRotate((prev) => !prev)}
          >
            <RotateCw />
          </Button>
        </Hint>

        <Hint content={t("skinStage.outerLayer")}>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-pressed={showOuterLayer}
            aria-label={t("skinStage.outerLayer")}
            className={cn(showOuterLayer && "bg-primary-soft text-foreground")}
            onClick={() => setShowOuterLayer((prev) => !prev)}
          >
            <Layers />
          </Button>
        </Hint>

        <Hint content={t("skinStage.elytra")}>
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={!capeUrl}
            aria-pressed={backEquipment === "elytra"}
            aria-label={t("skinStage.elytra")}
            className={cn(
              backEquipment === "elytra" && "bg-primary-soft text-foreground",
            )}
            onClick={() =>
              setBackEquipment((prev) => (prev === "cape" ? "elytra" : "cape"))
            }
          >
            <Shirt />
          </Button>
        </Hint>

        {nickname ? (
          <Hint content={t("skinStage.nameTag")}>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-pressed={showNameTag}
              aria-label={t("skinStage.nameTag")}
              className={cn(showNameTag && "bg-primary-soft text-foreground")}
              onClick={() => setShowNameTag((prev) => !prev)}
            >
              <Tag />
            </Button>
          </Hint>
        ) : null}

        <Hint content={t("skinStage.resetCamera")}>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("skinStage.resetCamera")}
            onClick={handleReset}
          >
            <RotateCcw />
          </Button>
        </Hint>
      </div>
    </div>
  );
}
