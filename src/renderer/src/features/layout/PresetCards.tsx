import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TSettings } from "@/types/Settings";
import {
  LAYOUT_PRESETS,
  matchPreset,
  presetValues,
  type LayoutPresetId,
} from "./presets";
import { applyPreset } from "./useLayout";

function PresetSketch({ id }: { id: LayoutPresetId }) {
  const values = presetValues(id);
  const rows = values.instancesView === "compact" ? 5 : 3;
  const hiddenNav = values.interface.hidden.filter((item) =>
    item.startsWith("sidebar."),
  ).length;

  return (
    <span
      aria-hidden
      className="flex h-10 w-16 shrink-0 gap-0.5 overflow-hidden rounded-md border border-border bg-background p-0.5"
    >
      <span
        className={cn(
          "flex shrink-0 flex-col gap-0.5 rounded-sm bg-surface-2 p-0.5",
          values.sidebarCollapsed ? "w-2" : "w-4",
        )}
      >
        {Array.from({ length: 4 - hiddenNav }).map((_, index) => (
          <span key={index} className="h-0.5 rounded-full bg-faint/60" />
        ))}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "h-2.5 rounded-sm",
            values.ambientTint ? "bg-primary/30" : "bg-surface-3",
          )}
        />
        {Array.from({ length: rows }).map((_, index) => (
          <span
            key={index}
            className={cn(
              "rounded-[2px] bg-surface-3",
              rows > 3 ? "h-0.5" : "h-1",
            )}
          />
        ))}
      </span>
    </span>
  );
}

export function PresetCards({ settings }: { settings: TSettings }) {
  const { t } = useTranslation();
  const active = matchPreset(settings);

  return (
    <div className="mt-2.5">
      <div
        role="radiogroup"
        aria-label={t("layout.presets.title")}
        className="grid grid-cols-3 gap-2"
      >
        {LAYOUT_PRESETS.map((id) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => applyPreset(id)}
              className={cn(
                "relative flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                isActive
                  ? "border-primary/50 bg-primary-soft"
                  : "border-border bg-surface-2 hover:bg-surface-3",
              )}
            >
              <PresetSketch id={id} />
              <span className="grid min-w-0 gap-0.5">
                <span className="truncate text-sm font-medium text-foreground">
                  {t(`layout.presets.${id}.title`)}
                </span>
                <span className="text-xs leading-snug text-muted-foreground">
                  {t(`layout.presets.${id}.description`)}
                </span>
              </span>
              {isActive && (
                <Check className="absolute top-2 right-2 size-3.5 text-primary" />
              )}
            </button>
          );
        })}
      </div>
      {!active && (
        <p className="mt-1.5 text-xs text-faint">{t("layout.presets.custom")}</p>
      )}
    </div>
  );
}
