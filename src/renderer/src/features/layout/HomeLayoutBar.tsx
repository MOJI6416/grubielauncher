import { LayoutTemplate } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HOME_BLOCKS, isSlotHidden, slotId } from "./layout";
import { setSlotVisible, useLayout } from "./useLayout";
import { SlotItem } from "./SlotItem";

export function HomeLayoutBar() {
  const { t } = useTranslation();
  const layout = useLayout();
  const isHeroHidden = isSlotHidden(layout, slotId.home("hero"));

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 rounded-xl border border-dashed border-input px-3">
      <LayoutTemplate className="size-3.5 shrink-0 text-faint" />
      <span className="text-xs text-muted-foreground">{t("layout.home.title")}</span>
      <div className="ml-auto flex items-center gap-1.5">
        {HOME_BLOCKS.map((block) => {
          const id = slotId.home(block);
          const hidden = isSlotHidden(layout, id);
          const label = t(`layout.home.${block}`);
          return (
            <SlotItem
              key={block}
              size="pill"
              label={label}
              hidden={hidden}
              disabled={block !== "hero" && isHeroHidden}
              disabledReason={t("layout.home.needsHero")}
              onToggle={() => setSlotVisible(id, label, hidden)}
            />
          );
        })}
      </div>
    </div>
  );
}
