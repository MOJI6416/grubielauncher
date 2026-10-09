import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Download, Info, Plus, TriangleAlert } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  javaFit,
  type JavaOverride,
  type JavaRuntimeList,
} from "@/shared/javaRuntime";
import {
  decodeJavaOverride,
  effectiveJava,
  encodeJavaOverride,
  installedRuntimes,
  javaLabel,
  javaMajors,
  managedRuntime,
  preferredRuntime,
} from "./javaChoices";
import { useJavaRuntimes } from "./useJavaRuntimes";

const JAVA_AUTO = "auto";
const JAVA_ADD = "add";

export const JAVA_STATUS_TONE = {
  faint: "text-faint",
  warning: "text-warning",
  destructive: "text-destructive",
} as const;

export interface JavaStatus {
  tone: keyof typeof JAVA_STATUS_TONE;
  icon: typeof Info;
  text: string;
}

export function javaStatus(
  value: JavaOverride | undefined,
  requiredMajor: number,
  list: JavaRuntimeList | null,
  t: TFunction,
): JavaStatus | null {
  const current = effectiveJava(value, requiredMajor, list);
  const fit =
    current.major === null ? null : javaFit(requiredMajor, current.major);

  if (current.missing) {
    return {
      tone: "destructive",
      icon: TriangleAlert,
      text: t("instanceSettings.java.missing"),
    };
  }
  if (value && fit === "too_old") {
    return {
      tone: "destructive",
      icon: TriangleAlert,
      text: t("instanceSettings.java.tooOld", { major: requiredMajor }),
    };
  }
  if (value && fit === "legacy_risk") {
    return {
      tone: "warning",
      icon: TriangleAlert,
      text: t("instanceSettings.java.legacyRisk"),
    };
  }
  if (!current.installed) {
    return { tone: "faint", icon: Download, text: t("java.downloadsOnLaunch") };
  }
  if (value && fit === "newer") {
    return {
      tone: "faint",
      icon: Info,
      text: t("instanceSettings.java.newer", { major: requiredMajor }),
    };
  }
  return null;
}

export function JavaPicker({
  value,
  requiredMajor,
  disabled,
  className,
  onChange,
}: {
  value: JavaOverride | undefined;
  requiredMajor: number;
  disabled?: boolean;
  className?: string;
  onChange: (next: JavaOverride | undefined) => void;
}) {
  const { t } = useTranslation();
  const { list, add } = useJavaRuntimes();
  const current = effectiveJava(value, requiredMajor, list);
  const auto = effectiveJava(undefined, requiredMajor, list);
  const selected = value ? encodeJavaOverride(value) : JAVA_AUTO;
  const majors = javaMajors(list, [requiredMajor]);
  const runtimes = installedRuntimes(list);
  const knownValues = new Set([
    JAVA_AUTO,
    ...majors.map((major) => encodeJavaOverride({ major })),
    ...runtimes.map((runtime) => encodeJavaOverride({ home: runtime.home })),
  ]);

  const choose = async (next: string) => {
    if (next === JAVA_ADD) {
      const runtime = await add();
      if (runtime) onChange({ home: runtime.home });
      return;
    }
    if (next === JAVA_AUTO) {
      onChange(undefined);
      return;
    }
    const java = decodeJavaOverride(next);
    if (java) onChange(java);
  };

  const vendorOf = (major: number) => {
    const runtime = preferredRuntime(list, major) ?? managedRuntime(list, major);
    return runtime?.vendor ?? t("java.downloadsOnLaunch");
  };

  return (
    <Select
      value={selected}
      disabled={disabled}
      onValueChange={(next) => void choose(next)}
    >
      <SelectTrigger
        size="sm"
        className={cn("h-7 text-xs", className)}
        aria-label={t("instanceSettings.java.title")}
      >
        <SelectValue>
          {current.missing ? (
            <span className="text-destructive">{t("java.missing")}</span>
          ) : value ? (
            <span className="font-mono tabular-nums">
              Java {javaLabel(current)}
            </span>
          ) : (
            <span>
              {t("java.auto")}
              <span className="font-mono text-faint tabular-nums">
                {` · Java ${auto.major}`}
              </span>
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={JAVA_AUTO}>
          <span>{t("java.auto")}</span>
          <span className="text-faint">
            {t("instanceSettings.java.autoHint", { major: requiredMajor })}
          </span>
        </SelectItem>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>{t("java.groupLauncher")}</SelectLabel>
          {majors.map((major) => (
            <SelectItem key={major} value={encodeJavaOverride({ major })}>
              <span className="font-mono tabular-nums">Java {major}</span>
              <span className="text-faint">{vendorOf(major)}</span>
            </SelectItem>
          ))}
        </SelectGroup>
        {runtimes.length > 0 && (
          <SelectGroup>
            <SelectLabel>{t("java.groupInstalled")}</SelectLabel>
            {runtimes.map((runtime) => (
              <SelectItem
                key={runtime.home}
                value={encodeJavaOverride({ home: runtime.home })}
              >
                <span className="font-mono tabular-nums">
                  Java {runtime.major}
                </span>
                <span className="text-faint">
                  {[runtime.vendor, runtime.version].filter(Boolean).join(" ")}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {!knownValues.has(selected) && (
          <SelectItem value={selected} disabled>
            {t("java.missing")}
          </SelectItem>
        )}
        <SelectSeparator />
        <SelectItem value={JAVA_ADD}>
          <Plus />
          <span>{t("java.add")}</span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
