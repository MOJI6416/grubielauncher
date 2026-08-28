import { Loader } from "@/types/Loader";
import { Blocks, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import fabricIcon from "@renderer/assets/loaders/fabric.svg";
import forgeIcon from "@renderer/assets/loaders/forge.svg";
import neoforgeIcon from "@renderer/assets/loaders/neoforge.svg";
import quiltIcon from "@renderer/assets/loaders/quilt.svg";

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
} satisfies Record<Loader, LoaderInfo> as Record<Loader, LoaderInfo>;

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
      <span className={`truncate ${textClassName}`.trim()}>{info.name}</span>
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
      className="grid grid-cols-5 gap-1.5"
    >
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
  );
}
