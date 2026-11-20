import { useTranslation } from "react-i18next";
import { Files } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ModpackRollbackInfo } from "@/types/ModpackSource";
import { Hint } from "@renderer/components/Hint";

export function RollbackFiles({
  rollback,
}: {
  rollback: ModpackRollbackInfo;
}) {
  const { t } = useTranslation();
  const files = rollback.restores ?? [];
  const removes = rollback.removes ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="ghost">
          <Files />
          {t("modpack.rollback.backups")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <p className="text-xs leading-snug text-muted-foreground">
          {files.length > 0
            ? t("modpack.rollback.filesHint", { count: files.length })
            : t("modpack.rollback.filesNone")}
        </p>
        {removes > 0 && (
          <p className="mt-1 text-xs leading-snug text-faint">
            {t("modpack.rollback.removes", { count: removes })}
          </p>
        )}
        {files.length > 0 && (
          <ul className="mt-2.5 flex max-h-52 flex-col overflow-y-auto rounded-lg bg-surface-2 py-1">
            {files.map((file) => (
              <li key={file} className="flex min-w-0 px-2.5">
                <Hint content={file} variant="text" truncatedOnly>
                  <span className="min-w-0 truncate py-0.5 font-mono text-2xs text-muted-foreground">
                    {file}
                  </span>
                </Hint>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
