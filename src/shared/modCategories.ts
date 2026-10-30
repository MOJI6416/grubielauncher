export const LIBRARY_CATEGORY = "library";

const CURSEFORGE_CATEGORIES: Readonly<Record<number, string>> = {
  6814: "optimization",
  6821: "utility",
  421: LIBRARY_CATEGORY,
  423: "utility",
  5191: "utility",
  435: "management",
  434: "equipment",
  436: "food",
  412: "technology",
  4558: "technology",
  414: "transportation",
  420: "storage",
  406: "worldgen",
  411: "mobs",
  419: "magic",
  422: "adventure",
  424: "decoration",
  400: "realistic",
  403: "vanilla-like",
  5244: "fonts",
  4465: "modded",
  399: "themed",
  401: "themed",
  402: "themed",
  393: "16x",
  394: "32x",
  395: "64x",
  396: "128x",
  397: "256x",
  398: "512x+",
  6553: "realistic",
  6554: "fantasy",
  6555: "vanilla-like",
  6948: "adventure",
  6950: LIBRARY_CATEGORY,
  6951: "technology",
  6952: "magic",
  6953: "utility",
};

const CURSEFORGE_PARENTS: Readonly<Record<number, string>> = {
  406: "worldgen",
  412: "technology",
};

export function curseForgeCategories(
  categories:
    | readonly { id: number; parentCategoryId?: number | null }[]
    | null
    | undefined,
): string[] {
  const slugs = new Set<string>();

  for (const category of categories ?? []) {
    const slug =
      CURSEFORGE_CATEGORIES[category.id] ??
      (category.parentCategoryId
        ? CURSEFORGE_PARENTS[category.parentCategoryId]
        : undefined);
    if (slug) slugs.add(slug);
  }

  return [...slugs];
}

export function modrinthCategories(
  categories: readonly unknown[] | null | undefined,
): string[] {
  const slugs = new Set<string>();

  for (const category of categories ?? []) {
    if (typeof category === "string" && category.trim()) {
      slugs.add(category.trim().toLowerCase());
    }
  }

  return [...slugs];
}

export function isLibraryOnly(categories: readonly string[] | undefined): boolean {
  return (
    !!categories &&
    categories.length > 0 &&
    categories.every((category) => category === LIBRARY_CATEGORY)
  );
}
