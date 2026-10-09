import {
  MANAGED_JAVA_MAJORS,
  normalizeJavaOverride,
  sameJavaHome,
  type JavaOverride,
  type JavaRuntimeInfo,
  type JavaRuntimeList,
} from "@/shared/javaRuntime";
import { instanceJavaMajor } from "@/shared/javaVersions";

const MAJOR_PREFIX = "major:";
const HOME_PREFIX = "home:";

export interface EffectiveJava {
  major: number | null;
  vendor: string | null;
  version: string | null;
  home: string | null;
  installed: boolean;
  missing: boolean;
}

export function encodeJavaOverride(override: JavaOverride): string {
  return "home" in override
    ? `${HOME_PREFIX}${override.home}`
    : `${MAJOR_PREFIX}${override.major}`;
}

export function decodeJavaOverride(value: string): JavaOverride | undefined {
  if (value.startsWith(HOME_PREFIX)) {
    return normalizeJavaOverride({ home: value.slice(HOME_PREFIX.length) });
  }
  if (value.startsWith(MAJOR_PREFIX)) {
    return normalizeJavaOverride({
      major: Number(value.slice(MAJOR_PREFIX.length)),
    });
  }
  return undefined;
}

export function javaMajors(
  list: JavaRuntimeList | null,
  extra: (number | null | undefined)[] = [],
): number[] {
  const majors = new Set<number>(MANAGED_JAVA_MAJORS);
  for (const major of extra) if (typeof major === "number") majors.add(major);
  for (const key of Object.keys(list?.defaults ?? {})) majors.add(Number(key));
  return [...majors].filter(Number.isFinite).sort((left, right) => left - right);
}

export function installedRuntimes(
  list: JavaRuntimeList | null,
): JavaRuntimeInfo[] {
  return (list?.runtimes ?? []).filter(
    (runtime) => runtime.source !== "managed" && !runtime.missing,
  );
}

export function findRuntime(
  list: JavaRuntimeList | null,
  home: string,
): JavaRuntimeInfo | null {
  return (
    list?.runtimes.find((runtime) => sameJavaHome(runtime.home, home)) ?? null
  );
}

export function preferredRuntime(
  list: JavaRuntimeList | null,
  major: number,
): JavaRuntimeInfo | null {
  const home = list?.defaults[String(major)];
  if (!home) return null;
  const runtime = findRuntime(list, home);
  return runtime && !runtime.missing && runtime.major === major ? runtime : null;
}

export function managedRuntime(
  list: JavaRuntimeList | null,
  major: number,
): JavaRuntimeInfo | null {
  return (
    list?.runtimes.find(
      (runtime) => runtime.source === "managed" && runtime.major === major,
    ) ?? null
  );
}

export function effectiveJava(
  override: JavaOverride | undefined,
  requiredMajor: number,
  list: JavaRuntimeList | null,
): EffectiveJava {
  const normalized = normalizeJavaOverride(override);

  if (normalized && "home" in normalized) {
    const runtime = findRuntime(list, normalized.home);
    return {
      major: runtime?.major ?? null,
      vendor: runtime?.vendor ?? null,
      version: runtime?.version ?? null,
      home: normalized.home,
      installed: Boolean(runtime && !runtime.missing),
      missing: !runtime || Boolean(runtime.missing),
    };
  }

  const major = normalized?.major ?? requiredMajor;
  const runtime = preferredRuntime(list, major) ?? managedRuntime(list, major);

  return {
    major,
    vendor: runtime?.vendor ?? null,
    version: runtime?.version ?? null,
    home: runtime?.home ?? null,
    installed: Boolean(runtime),
    missing: false,
  };
}

export function javaLabel(java: Pick<EffectiveJava, "major" | "vendor">): string {
  if (java.major === null) return "—";
  return java.vendor ? `${java.major} · ${java.vendor}` : String(java.major);
}

export type MinecraftRangeKey =
  | "legacy"
  | "other"
  | "mc117"
  | "mc118"
  | "mc1205"
  | "calendar";

export function minecraftRangeKey(major: number): MinecraftRangeKey {
  if (major <= 8) return "legacy";
  if (major <= 15) return "other";
  if (major === 16) return "mc117";
  if (major <= 20) return "mc118";
  if (major <= 24) return "mc1205";
  return "calendar";
}

export function instanceRequiredJava(instance: {
  java?: { requiredMajor: number } | null;
  javaMajorVersion?: number;
  version: {
    version: { id: string };
    loader: { name: string; version?: { id: string } | null };
  };
}): number {
  return (
    instance.java?.requiredMajor ??
    instance.javaMajorVersion ??
    instanceJavaMajor(
      instance.version.version.id,
      instance.version.loader.name,
      undefined,
      instance.version.loader.version?.id,
    )
  );
}
