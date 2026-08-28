import type {
  StorageBreakdown,
  StorageCategoryId,
  StorageCleanupKind,
} from "@/types/Storage";

export type CleanupAction = StorageCleanupKind | "cache";

export interface StorageSlice {
  id: StorageCategoryId;
  size: number;
  percent: number;
}

export interface CleanupOffer {
  action: CleanupAction;
  size: number;
  count: number;
  destructive: boolean;
}

const CATEGORY_ORDER: StorageCategoryId[] = [
  "versions",
  "libraries",
  "assets",
  "java",
  "backups",
  "appData",
  "other",
];

export function storageSlices(
  breakdown: StorageBreakdown | null,
): StorageSlice[] {
  if (!breakdown || breakdown.total <= 0) return [];

  return breakdown.categories
    .filter((category) => category.size > 0)
    .sort(
      (a, b) =>
        b.size - a.size || CATEGORY_ORDER.indexOf(a.id) - CATEGORY_ORDER.indexOf(b.id),
    )
    .map((category) => ({
      id: category.id,
      size: category.size,
      percent: Math.round((category.size / breakdown.total) * 100),
    }));
}

export function cleanupOffers(
  breakdown: StorageBreakdown | null,
): CleanupOffer[] {
  if (!breakdown) return [];

  const offers: CleanupOffer[] = [];
  const { cleanup, reclaimable } = breakdown;

  if (reclaimable > 0) {
    offers.push({
      action: "cache",
      size: reclaimable,
      count: 0,
      destructive: false,
    });
  }

  if (cleanup.java.count > 0) {
    offers.push({
      action: "java",
      size: cleanup.java.size,
      count: cleanup.java.count,
      destructive: false,
    });
  }

  if (cleanup.libraries.safe && cleanup.libraries.count > 0) {
    offers.push({
      action: "libraries",
      size: cleanup.libraries.size,
      count: cleanup.libraries.count,
      destructive: false,
    });
  }

  if (cleanup.backups.count > 0) {
    offers.push({
      action: "backups",
      size: cleanup.backups.size,
      count: cleanup.backups.count,
      destructive: true,
    });
  }

  if (cleanup.instances.count > 0) {
    offers.push({
      action: "instances",
      size: cleanup.instances.size,
      count: cleanup.instances.count,
      destructive: cleanup.instances.dataNames.length > 0,
    });
  }

  return offers;
}

export function totalReclaimable(breakdown: StorageBreakdown | null): number {
  return cleanupOffers(breakdown).reduce((sum, offer) => sum + offer.size, 0);
}

export function topVersions(
  breakdown: StorageBreakdown | null,
  limit: number,
): { entries: { name: string; size: number; percent: number }[]; rest: number } {
  const versions = breakdown?.versions ?? [];
  if (versions.length === 0) return { entries: [], rest: 0 };

  const biggest = versions[0]?.size || 1;
  const visible = versions.slice(0, limit);

  return {
    entries: visible.map((version) => ({
      name: version.name,
      size: version.size,
      percent: Math.round((version.size / biggest) * 100),
    })),
    rest: Math.max(0, versions.length - visible.length),
  };
}
