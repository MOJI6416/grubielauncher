import type { ForeignLauncher } from "@/types/LauncherImport";
import { cn } from "@/lib/utils";
import { Provider } from "@/types/ModManager";
import { ContentProviderIcon } from "@renderer/components/ContentProviderIcon";
import prismIcon from "@renderer/assets/launchers/prism.svg";
import multimcIcon from "@renderer/assets/launchers/multimc.svg";
import atlauncherIcon from "@renderer/assets/launchers/atlauncher.png";
import gdlauncherIcon from "@renderer/assets/launchers/gdlauncher.svg";
import minecraftIcon from "@renderer/assets/launchers/minecraft.png";
import tlauncherIcon from "@renderer/assets/launchers/tlauncher.png";
import legacyIcon from "@renderer/assets/launchers/legacy.png";

const LOGOS: Record<Exclude<ForeignLauncher, "curseforge" | "modrinth">, string> = {
  prism: prismIcon,
  multimc: multimcIcon,
  atlauncher: atlauncherIcon,
  gdlauncher: gdlauncherIcon,
  official: minecraftIcon,
  tlauncher: tlauncherIcon,
  legacy: legacyIcon,
};

export function LauncherMark({
  launcher,
  className,
}: {
  launcher: ForeignLauncher;
  className?: string;
}) {
  if (launcher === "curseforge" || launcher === "modrinth") {
    return (
      <ContentProviderIcon
        provider={launcher === "curseforge" ? Provider.CURSEFORGE : Provider.MODRINTH}
        className={cn("size-4", className)}
      />
    );
  }

  return (
    <img
      src={LOGOS[launcher]}
      alt=""
      aria-hidden
      draggable={false}
      className={cn(
        "size-4 shrink-0 object-contain",
        launcher === "official" && "[image-rendering:pixelated]",
        className,
      )}
    />
  );
}
