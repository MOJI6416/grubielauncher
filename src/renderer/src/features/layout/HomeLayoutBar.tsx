import { LayoutTemplate } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HOME_BLOCKS, isSlotHidden, slotId } from "./layout";
import { toggleSlot, useLayout } from "./useLayout";
import { LayoutChip } from "./LayoutChip";

export function HomeLayoutBar() {
  const { t } = useTranslation();
  const layout = useLayout();
  const isHeroHidden = isSlotHidden(layout, slotId.home("hero"));

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 rounded-xl border border-dashed border-primary/40 px-3">
      <LayoutTemplate className="size-3.5 shrink-0 text-faint" />
      <span className="text-xs text-muted-foreground">{t("layout.home.title")}</span>
      <div className="ml-auto flex items-center gap-1.5">
        {HOME_BLOCKS.map((block) => {
          const hidden = isSlotHidden(layout, slotId.home(block));
          return (
            <LayoutChip
              key={block}
              label={t(`layout.home.${block}`)}
              hidden={hidden}
              disabled={block !== "hero" && isHeroHidden}
              onToggle={() => toggleSlot(slotId.home(block), !hidden)}
            />
          );
        })}
      </div>
    </div>
  );
}
