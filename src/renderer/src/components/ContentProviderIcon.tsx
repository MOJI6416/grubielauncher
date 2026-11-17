import { FileBox } from "lucide-react";
import { SiCurseforge, SiModrinth } from "react-icons/si";
import { cn } from "@/lib/utils";
import { Provider } from "@/types/ModManager";

export function ContentProviderIcon({
  provider,
  className,
}: {
  provider: Provider | `${Provider}` | string | undefined;
  className?: string;
}) {
  const classes = cn("size-3.5 shrink-0", className);

  if (provider === Provider.CURSEFORGE)
    return <SiCurseforge aria-hidden className={classes} />;
  if (provider === Provider.MODRINTH)
    return <SiModrinth aria-hidden className={classes} />;

  return <FileBox aria-hidden className={classes} />;
}
