import {
  DEFAULT_INTERFACE_LAYOUT,
  type InterfaceLayout,
  type TSettings,
} from "@/types/Settings";

export type LayoutPresetId = "standard" | "compact" | "minimal";

export const LAYOUT_PRESETS: LayoutPresetId[] = ["standard", "compact", "minimal"];

export type PresetValues = Pick<
  TSettings,
  "interface" | "sidebarCollapsed" | "instancesView" | "ambientTint" | "backgroundGrain"
>;

const PRESETS: Record<LayoutPresetId, PresetValues> = {
  standard: {
    interface: DEFAULT_INTERFACE_LAYOUT,
    sidebarCollapsed: false,
    instancesView: "list",
    ambientTint: true,
    backgroundGrain: true,
  },
  compact: {
    interface: { ...DEFAULT_INTERFACE_LAYOUT, hidden: ["home.stats"], dockLimit: 10 },
    sidebarCollapsed: true,
    instancesView: "compact",
    ambientTint: true,
    backgroundGrain: true,
  },
  minimal: {
    interface: {
      ...DEFAULT_INTERFACE_LAYOUT,
      hidden: ["sidebar.people", "sidebar.news", "home.stats", "home.continue"],
    },
    sidebarCollapsed: false,
    instancesView: "compact",
    ambientTint: false,
    backgroundGrain: false,
  },
};

export function presetValues(id: LayoutPresetId): PresetValues {
  return PRESETS[id];
}

export function currentPresetValues(settings: TSettings): PresetValues {
  return {
    interface: settings.interface,
    sidebarCollapsed: settings.sidebarCollapsed,
    instancesView: settings.instancesView,
    ambientTint: settings.ambientTint,
    backgroundGrain: settings.backgroundGrain,
  };
}

function layoutKey(layout: InterfaceLayout): string {
  return JSON.stringify({ ...layout, hidden: [...layout.hidden].sort() });
}

function sameValues(a: PresetValues, b: PresetValues): boolean {
  return (
    layoutKey(a.interface) === layoutKey(b.interface) &&
    a.sidebarCollapsed === b.sidebarCollapsed &&
    a.instancesView === b.instancesView &&
    a.ambientTint === b.ambientTint &&
    a.backgroundGrain === b.backgroundGrain
  );
}

export function matchPreset(settings: TSettings): LayoutPresetId | null {
  const current = currentPresetValues(settings);
  return LAYOUT_PRESETS.find((id) => sameValues(current, PRESETS[id])) ?? null;
}
