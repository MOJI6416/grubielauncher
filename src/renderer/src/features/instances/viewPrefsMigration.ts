import {
  DEFAULT_SETTINGS,
  InstancesSort,
  InstancesView,
  TSettings,
} from "@/types/Settings";

export const LEGACY_VIEW_KEY = "grubie:versionsView";
export const LEGACY_SORT_KEY = "grubie:versionsSort";

const VIEWS: InstancesView[] = ["list", "grid"];
const SORTS: InstancesSort[] = ["activity", "name", "manual"];

export function migrateInstancesViewPrefs(
  settings: TSettings,
  legacy: { view: string | null; sort: string | null },
): Partial<TSettings> | null {
  const patch: Partial<TSettings> = {};

  if (
    settings.instancesView === DEFAULT_SETTINGS.instancesView &&
    VIEWS.includes(legacy.view as InstancesView) &&
    legacy.view !== DEFAULT_SETTINGS.instancesView
  ) {
    patch.instancesView = legacy.view as InstancesView;
  }

  if (
    settings.instancesSort === DEFAULT_SETTINGS.instancesSort &&
    SORTS.includes(legacy.sort as InstancesSort) &&
    legacy.sort !== DEFAULT_SETTINGS.instancesSort
  ) {
    patch.instancesSort = legacy.sort as InstancesSort;
  }

  return Object.keys(patch).length ? patch : null;
}

export function readLegacyViewPrefs(): { view: string | null; sort: string | null } {
  try {
    return {
      view: localStorage.getItem(LEGACY_VIEW_KEY),
      sort: localStorage.getItem(LEGACY_SORT_KEY),
    };
  } catch {
    return { view: null, sort: null };
  }
}

export function forgetLegacyViewPrefs(): void {
  try {
    localStorage.removeItem(LEGACY_VIEW_KEY);
    localStorage.removeItem(LEGACY_SORT_KEY);
  } catch {}
}
