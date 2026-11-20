import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { countFeature } from "@renderer/features/usage/usage";
import type { FeatureLink } from "./featureLinks";
import { canOpenFeatureLink, openFeatureLink } from "./openFeatureLink";

export function FeatureLinkButton({
  link,
  onBeforeOpen,
}: {
  link: FeatureLink | null;
  onBeforeOpen?: () => void;
}) {
  const { t } = useTranslation();

  if (!link || !canOpenFeatureLink(link)) return null;

  return (
    <Button
      variant="ghost"
      size="xs"
      className="-my-0.5 shrink-0 text-muted-foreground"
      onClick={() => {
        countFeature("whatsNew.link");
        onBeforeOpen?.();
        openFeatureLink(link);
      }}
    >
      {t("whatsNew.open")}
      <ArrowRight />
    </Button>
  );
}
