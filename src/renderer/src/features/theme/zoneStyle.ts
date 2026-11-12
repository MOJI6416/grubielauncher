import { useMemo, type CSSProperties } from "react";
import { useAtomValue } from "jotai";
import { selectAtom } from "jotai/utils";
import { ACCENTS, DEFAULT_ACCENT, isAccentId } from "@/shared/accents";
import { zoneVariables, type ThemeZone } from "@/shared/themes";
import { settingsAtom } from "@renderer/stores/atoms";
import { useActiveTheme } from "./themesStore";

const accentIdAtom = selectAtom(settingsAtom, (settings) => settings.accent);
const highContrastAtom = selectAtom(settingsAtom, (settings) => settings.highContrast);

export function useZoneStyle(zone: ThemeZone): CSSProperties | undefined {
  const theme = useActiveTheme();
  const accentId = useAtomValue(accentIdAtom);
  const highContrast = useAtomValue(highContrastAtom);

  return useMemo(() => {
    const accent = ACCENTS[isAccentId(accentId) ? accentId : DEFAULT_ACCENT].primary;
    return (zoneVariables(theme, zone, accent, highContrast) ?? undefined) as
      | CSSProperties
      | undefined;
  }, [theme, zone, accentId, highContrast]);
}
