import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ModIdConflict } from "@/types/ModBisect";
import { Hint } from "@renderer/components/Hint";
import { formatBytes } from "@renderer/utilities/file";
import { onRadioKeyDown } from "@renderer/utilities/radioKeys";
import { conflictExtras, pickKeeper } from "@renderer/features/bisect/bisectSession";

export function ModIdConflictDialog({
  conflicts,
  sizeUnits,
  onApply,
  onClose,
}: {
  conflicts: ModIdConflict[];
  sizeUnits: string[];
  onApply: (extras: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [keepers, setKeepers] = useState<Record<string, string>>({});
  const extras = conflictExtras(conflicts, keepers);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <CopyX className="size-5 shrink-0" />
            <span className="truncate">{t("modManager.conflict.title")}</span>
          </DialogTitle>
          <DialogDescription>{t("modManager.conflict.text")}</DialogDescription>
        </DialogHeader>

        <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
          {conflicts.map((conflict) => {
            const keeper = keepers[conflict.modId] ?? pickKeeper(conflict.files);
            const newest = pickKeeper(conflict.files);
            const pick = (fileName: string) =>
              setKeepers((previous) => ({ ...previous, [conflict.modId]: fileName }));
            return (
              <section key={conflict.modId} className="flex flex-col gap-1">
                <h3 className="text-xs font-medium text-foreground">
                  {conflict.files[0]?.title || conflict.modId}
                  <span className="ml-1.5 font-mono text-faint">{conflict.modId}</span>
                </h3>
                <div
                  role="radiogroup"
                  aria-label={conflict.files[0]?.title || conflict.modId}
                  className="flex flex-col gap-1"
                  onKeyDown={(event) =>
                    onRadioKeyDown(
                      event,
                      conflict.files.map((file) => file.fileName),
                      keeper,
                      pick,
                    )
                  }
                >
                  {conflict.files.map((file) => {
                    const checked = file.fileName === keeper;
                    return (
                      <button
                        key={file.fileName}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        tabIndex={checked ? 0 : -1}
                        onClick={() => pick(file.fileName)}
                        className={cn(
                          "flex h-9 min-w-0 items-center gap-2 rounded-lg border px-2.5 text-left transition-colors",
                          checked
                            ? "border-border bg-row-selected"
                            : "border-transparent bg-surface-2 hover:bg-row-hover",
                        )}
                      >
                        <span
                          className={cn(
                            "size-3 shrink-0 rounded-full border",
                            checked
                              ? "border-foreground bg-foreground"
                              : "border-faint",
                          )}
                        />
                        <Hint content={file.fileName} variant="text" truncatedOnly>
                          <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                            {file.fileName}
                          </span>
                        </Hint>
                        {file.fileName === newest && (
                          <span className="shrink-0 text-3xs text-info">
                            {t("modManager.conflict.newest")}
                          </span>
                        )}
                        <span className="shrink-0 font-mono text-2xs whitespace-nowrap tabular-nums text-faint">
                          {file.version || "—"}
                        </span>
                        <span className="shrink-0 font-mono text-2xs whitespace-nowrap tabular-nums text-faint">
                          {formatBytes(file.size, sizeUnits)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={extras.length === 0}
            onClick={() => {
              onApply(extras);
              onClose();
            }}
          >
            {t("modManager.conflict.apply", { count: extras.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
