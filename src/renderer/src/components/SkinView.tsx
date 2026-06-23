import { ISkinData } from "@/types/Skin";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactSkinview3d from "react-skinview3d";
import {
  FlyingAnimation,
  IdleAnimation,
  RunningAnimation,
  SkinViewer,
  WalkingAnimation,
} from "skinview3d";
import minecraftFontUrl from "skinview3d/assets/minecraft.woff2";
import { Loader2 } from "lucide-react";

type Animation = "null" | "idle" | "walk" | "run" | "fly";

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
  isOwner,
  setScreenshotFile,
}: {
  skinData: ISkinData;
  nickname?: string;
  isOwner: boolean;
  onClose: () => void;
  setScreenshotFile?: (data: string) => void;
}) {
  const [animationState, setAnimationState] = useState<Animation>("null");
  const [isAutoRotating, setIsAutoRotating] = useState(false);
  const [rotateSpeed, setRotateSpeed] = useState(1);
  const [isNameTag, setIsNameTag] = useState(true);
  const [isFontReady, setIsFontReady] = useState(
    () =>
      typeof document !== "undefined" &&
      "fonts" in document &&
      document.fonts.check("16px Minecraft"),
  );
  const viewerRef = useRef<SkinViewer>(null);

  const { t } = useTranslation();

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

  function setAnimation(animation: Animation) {
    if (!viewerRef.current) return;

    setAnimationState(animation);
    switch (animation) {
      case "idle":
        viewerRef.current.animation = new IdleAnimation();
        break;
      case "walk":
        viewerRef.current.animation = new WalkingAnimation();
        break;
      case "run":
        viewerRef.current.animation = new RunningAnimation();
        break;
      case "fly":
        viewerRef.current.animation = new FlyingAnimation();
        break;
      default:
        viewerRef.current.animation = null;
        break;
    }
  }

  function setAutoRotate(isEnabled: boolean) {
    setIsAutoRotating(isEnabled);
    if (!viewerRef.current) return;

    viewerRef.current.autoRotate = isEnabled;
    viewerRef.current.autoRotateSpeed = rotateSpeed;
  }

  function setSpeed(value: number[]) {
    const speed = value[0] ?? rotateSpeed;
    setRotateSpeed(speed);
    if (!viewerRef.current) return;

    viewerRef.current.autoRotateSpeed = speed;
  }

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent aria-describedby={undefined} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("skinView.title")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[240px_1fr]">
          <div className="flex justify-center rounded-xl border bg-card p-3 shadow-xs">
            {isFontReady ? (
              <ReactSkinview3d
                skinUrl={skinData.skin}
                capeUrl={skinData.cape}
                height={340}
                width={210}
                options={{
                  nameTag: nickname,
                  zoom: 0.75,
                  preserveDrawingBuffer: true,
                }}
                onReady={({ viewer }) => {
                  viewerRef.current = viewer;
                  viewer.autoRotate = isAutoRotating;
                  viewer.autoRotateSpeed = rotateSpeed;
                }}
              />
            ) : (
              <div className="flex h-[340px] w-[210px] items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="grid content-start gap-3">
            <section className="rounded-xl border bg-card p-3 shadow-xs">
              <div className="flex items-center justify-between gap-3">
                <div className="grid gap-0.5">
                  <Label
                    className="text-sm font-medium"
                    htmlFor="skin-view-rotate"
                  >
                    {t("skinView.rotation")}
                  </Label>
                </div>
                <Switch
                  id="skin-view-rotate"
                  checked={isAutoRotating}
                  onCheckedChange={setAutoRotate}
                />
              </div>

              <div
                className={`mt-4 grid gap-2 ${
                  isAutoRotating ? "" : "opacity-50"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <Label
                    className="text-xs text-muted-foreground"
                    htmlFor="skin-view-speed"
                  >
                    {t("skinView.speed")}
                  </Label>
                  <span className="rounded-md border bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                    {rotateSpeed}
                  </span>
                </div>
                <Slider
                  id="skin-view-speed"
                  min={-16}
                  max={16}
                  step={1}
                  value={[rotateSpeed]}
                  onValueChange={setSpeed}
                  disabled={!isAutoRotating}
                />
              </div>
            </section>

            <section className="rounded-xl border bg-card p-3 shadow-xs">
              <h3 className="mb-3 text-sm font-medium">
                {t("skinView.animation")}
              </h3>
              <RadioGroup
                className="grid gap-2 sm:grid-cols-2"
                value={animationState}
                onValueChange={(value) => setAnimation(value as Animation)}
              >
                {(
                  [
                    ["null", t("skinView.animations.0")],
                    ["idle", t("skinView.animations.1")],
                    ["walk", t("skinView.animations.2")],
                    ["run", t("skinView.animations.3")],
                  ["fly", t("skinView.animations.4")],
                ] as const
              ).map(([value, label]) => (
                  <div key={value} className="flex items-center gap-3">
                    <RadioGroupItem
                      id={`skin-view-animation-${value}`}
                      value={value}
                    />
                    <Label
                      className="text-sm"
                      htmlFor={`skin-view-animation-${value}`}
                    >
                      {label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </section>

            <section className="rounded-xl border bg-card p-3 shadow-xs">
              <h3 className="mb-3 text-sm font-medium">
                {t("skinView.additionally")}
              </h3>

              <div className="flex items-center justify-between gap-3">
                <Label className="text-sm" htmlFor="skin-view-show-name">
                  {t("skinView.showName")}
                </Label>
                <Switch
                  id="skin-view-show-name"
                  checked={isNameTag}
                  onCheckedChange={(checked) => {
                    if (!viewerRef.current) return;

                    setIsNameTag(checked);
                    viewerRef.current.nameTag = checked
                      ? nickname || null
                      : null;
                  }}
                />
              </div>

              {isOwner ? (
                <Button
                  className="mt-3"
                  size="sm"
                  onClick={() => {
                    if (!viewerRef.current || !setScreenshotFile) return;
                    const iconUrl =
                      viewerRef.current.canvas.toDataURL("image/png");

                    setScreenshotFile(iconUrl);
                  }}
                >
                  {t("skinView.setAvatar")}
                </Button>
              ) : undefined}
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
