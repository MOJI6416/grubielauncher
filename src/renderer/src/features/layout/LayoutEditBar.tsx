import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Check, LayoutTemplate, RotateCcw, SlidersHorizontal, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { navigate } from "@renderer/navigation/navigate";
import { isLayoutCustomized } from "./layout";
import {
  cancelLayoutEditing,
  finishLayoutEditing,
  resetLayout,
  useLayout,
  useLayoutEditing,
} from "./useLayout";

export function LayoutEditBar() {
  const { t } = useTranslation();
  const editing = useLayoutEditing();
  const layout = useLayout();

  useEffect(() => {
    if (!editing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      finishLayoutEditing();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [editing]);

  if (!editing) return null;

  return (
    <div
      role="toolbar"
      aria-label={t("layout.customize")}
      className="absolute bottom-3 left-1/2 z-40 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-popover py-2 pr-2 pl-3.5 shadow-lg"
    >
      <LayoutTemplate className="size-4 shrink-0 text-primary" />
      <p className="w-72 min-w-0 shrink text-xs leading-snug text-muted-foreground">
        {t("layout.editHint")}
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            finishLayoutEditing();
            navigate({ name: "settings", section: "layout" });
          }}
        >
          <SlidersHorizontal />
          {t("layout.moreSettings")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!isLayoutCustomized(layout)}
          onClick={resetLayout}
        >
          <RotateCcw />
          {t("layout.reset")}
        </Button>
        <Button variant="ghost" size="sm" onClick={cancelLayoutEditing}>
          <Undo2 />
          {t("common.cancel")}
        </Button>
        <Button variant="secondary" size="sm" onClick={finishLayoutEditing}>
          <Check />
          {t("layout.done")}
        </Button>
      </div>
    </div>
  );
}
