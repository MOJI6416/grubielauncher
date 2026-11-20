import { useTranslation } from "react-i18next";
import { Gauge } from "lucide-react";
import type { IVersionConf } from "@/types/IVersion";
import {
  isOptiFineChoice,
  optifineLabel,
  optifineOffer,
} from "@/shared/optifine";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { countFeature } from "@renderer/features/usage/usage";
import { SectionCard } from "@renderer/features/instances/SectionCard";
import { openSodiumIrisInstance } from "./optifineActions";

export function installedOptiFine(conf: IVersionConf) {
  const choice = conf.optifine;
  if (!choice || !isOptiFineChoice(choice)) return null;
  if (choice.minecraft !== conf.version.id) return null;
  return optifineOffer(conf.version.id, conf.loader.name) === "optifine"
    ? choice
    : null;
}

export function OptiFineSettingsRow({
  conf,
  onOpen,
  variant = "row",
}: {
  conf: IVersionConf;
  onOpen: () => void;
  variant?: "row" | "card";
}) {
  const { t } = useTranslation();
  const offer = optifineOffer(conf.version.id, conf.loader.name);
  if (!offer) return null;

  const choice = installedOptiFine(conf);
  const isSodium = offer === "sodium";
  const summary = isSodium
    ? t("optifine.sodium.better")
    : choice
      ? optifineLabel(choice.edition)
      : t("optifine.row.none");

  const content = (
    <>
      {variant === "row" && (
        <>
          <Gauge className="size-3.5 shrink-0 text-faint" />
          <span className="shrink-0 text-xs font-medium">
            {t("optifine.title")}
          </span>
        </>
      )}
      <Hint
        content={isSodium ? t("optifine.sodium.why") : summary}
        variant="text"
        truncatedOnly={!isSodium}
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-2xs",
            choice ? "font-mono text-muted-foreground" : "text-faint",
          )}
        >
          {summary}
        </span>
      </Hint>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        className="shrink-0 text-muted-foreground"
        onClick={() => {
          if (isSodium) {
            countFeature("optifine.sodium");
            openSodiumIrisInstance(conf.version.id);
            return;
          }
          onOpen();
        }}
      >
        {isSodium
          ? t("optifine.row.sodiumAction")
          : choice
            ? t("optifine.row.change")
            : t("optifine.row.add")}
      </Button>
    </>
  );

  if (variant === "card") {
    return (
      <SectionCard
        title={t("optifine.title")}
        icon={Gauge}
        className="shrink-0"
        bodyClassName="flex h-10 min-w-0 items-center gap-2 px-3"
      >
        {content}
      </SectionCard>
    );
  }

  return (
    <div className="flex h-9 min-w-0 items-center gap-2 border-t border-border/60 px-3">
      {content}
    </div>
  );
}
