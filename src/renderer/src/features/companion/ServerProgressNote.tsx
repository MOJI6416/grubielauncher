import { useTranslation } from "react-i18next";
import { Server } from "lucide-react";
import { Hint } from "@renderer/components/Hint";
import { useWorldStats } from "@renderer/features/profile/useProfileData";

export function ServerProgressNote() {
  const { t } = useTranslation();
  const { data } = useWorldStats(true);
  const servers = data?.servers ?? 0;
  const text =
    servers > 0
      ? t("companion.servers.counted", { count: servers })
      : t("companion.servers.none");

  return (
    <div className="flex shrink-0 items-center gap-2 px-1">
      <Server className="size-3.5 shrink-0 text-faint" />
      <Hint content={text} variant="text" truncatedOnly>
        <p className="min-w-0 flex-1 truncate text-2xs text-faint">{text}</p>
      </Hint>
    </div>
  );
}
