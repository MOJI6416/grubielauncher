import { Loader } from "@/types/Loader";
import { Blocks, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import fabricIcon from "@renderer/assets/loaders/fabric.svg";
import forgeIcon from "@renderer/assets/loaders/forge.svg";
import neoforgeIcon from "@renderer/assets/loaders/neoforge.svg";
import quiltIcon from "@renderer/assets/loaders/quilt.svg";
import legacyFabricIcon from "@renderer/assets/loaders/legacy-fabric.png";
import ornitheIcon from "@renderer/assets/loaders/ornithe.png";
import btaIcon from "@renderer/assets/loaders/bta.png";
import { LEGACY_LOADERS } from "@/shared/profileLoaders";
import { Hint } from "@renderer/components/Hint";

type LoaderInfo = {
  name: string;
  dot: string;
  icon?: string;
};

export const loaders = {
  vanilla: { name: "Vanilla", dot: "bg-loader-vanilla" },
  forge: { name: "Forge", dot: "bg-loader-forge", icon: forgeIcon },
  neoforge: { name: "NeoForge", dot: "bg-loader-neoforge", icon: neoforgeIcon },
  fabric: { name: "Fabric", dot: "bg-loader-fabric", icon: fabricIcon },
  quilt: { name: "Quilt", dot: "bg-loader-quilt", icon: quiltIcon },
  "legacy-fabric": {
    name: "Legacy Fabric",
    dot: "bg-loader-legacy-fabric",
    icon: legacyFabricIcon,
  },
  babric: {
    name: "Babric",
    dot: "bg-loader-babric",
    icon: fabricIcon,
  },
  ornithe: {
    name: "Ornithe",
    dot: "bg-loader-ornithe",
    icon: ornitheIcon,
  },
  "bta-babric": {
    name: "BTA (Babric)",
    dot: "bg-loader-bta",
    icon: btaIcon,
  },
} satisfies Record<Loader, LoaderInfo> as Record<Loader, LoaderInfo>;

const OLD_VERSION_LOADERS: Loader[] = [...LEGACY_LOADERS, "bta-babric"];

export const LOADER_ORDER: Loader[] = [
  "vanilla",
  "fabric",
  "neoforge",
  "forge",
  "quilt",
];

export function getLoaderInfo(loader?: string): LoaderInfo {
  if (loader && loader in loaders) {
    return loaders[loader as Loader];
  }

  return loaders.vanilla;
}

export function LoaderIcon({
  loader,
  className,
}: {
  loader: Loader;
  className?: string;
}) {
  const info = getLoaderInfo(loader);

  if (!info.icon) {
    return <Blocks className={cn("text-loader-vanilla", className)} />;
  }

  return (
    <img
      src={info.icon}
      alt=""
      aria-hidden
      draggable={false}
      className={cn("object-contain", className)}
    />
  );
}

export function LoaderLabel({
  loader,
  className = "",
  textClassName = "",
}: {
  loader?: string;
  className?: string;
  textClassName?: string;
}) {
  const info = getLoaderInfo(loader);

  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1.5 align-middle ${className}`.trim()}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${info.dot}`} />
      <span className={`truncate leading-tight ${textClassName}`.trim()}>
        {info.name}
      </span>
    </span>
  );
}

export function LoaderPicker({
  value,
  onSelect,
  isLocked = false,
  unavailable = {},
}: {
  value: Loader;
  onSelect: (loader: Loader) => void;
  isLocked?: boolean;
  unavailable?: Partial<Record<Loader, string>>;
}) {
  const { t } = useTranslation();

  return (
    <div
      role="radiogroup"
      aria-label={t("versions.loader")}
      className="flex flex-col gap-1.5"
    >
      <div className="grid grid-cols-5 gap-1.5">
        {LOADER_ORDER.map((loader) => {
          const info = loaders[loader];
          const isSelected = value === loader;
          const reason = unavailable[loader];
          const isDisabled = (isLocked && !isSelected) || !!reason;

          return (
            <button
              key={loader}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={isDisabled}
              onClick={() => onSelect(loader)}
              className="group/loader flex min-w-0 flex-col gap-1 rounded-xl border border-border bg-surface-2 px-2.5 py-2 text-left transition-colors hover:bg-surface-3 aria-checked:border-primary/70 aria-checked:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface-2"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <LoaderIcon loader={loader} className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-[0.8rem] font-medium text-foreground">
                  {info.name}
                </span>
                {reason ? (
                  <Lock className="size-3 shrink-0 text-faint" />
                ) : (
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full opacity-0 transition-opacity group-aria-checked/loader:opacity-100",
                      info.dot,
                    )}
                  />
                )}
              </span>
              <span className="min-w-0 text-[0.68rem] leading-snug text-muted-foreground">
                {reason || t(`versions.loaderAbout.${loader}`)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 pr-1 text-[0.65rem] font-semibold tracking-[0.08em] text-faint uppercase">
          {t("versions.legacyLoaders")}
        </span>
        {OLD_VERSION_LOADERS.map((loader) => {
          const info = loaders[loader];
          const isSelected = value === loader;
          const reason = unavailable[loader];
          const isDisabled = (isLocked && !isSelected) || !!reason;

          return (
            <Hint
              key={loader}
              content={reason || t(`versions.loaderAbout.${loader}`)}
            >
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={isDisabled}
                onClick={() => onSelect(loader)}
                className="flex h-7 min-w-0 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 text-[0.75rem] font-medium text-foreground transition-colors hover:bg-surface-3 aria-checked:border-primary/70 aria-checked:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface-2"
              >
                <LoaderIcon loader={loader} className="size-3.5 shrink-0" />
                <span className="truncate">{info.name}</span>
                {reason && <Lock className="size-3 shrink-0 text-faint" />}
              </button>
            </Hint>
          );
        })}
      </div>
    </div>
  );
}
