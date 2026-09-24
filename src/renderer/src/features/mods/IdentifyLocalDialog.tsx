import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SiCurseforge, SiModrinth } from "react-icons/si";
import { ArrowRight, CircleAlert, FileBox } from "lucide-react";
import { ILocalIdentifyMatch, Provider } from "@/types/ModManager";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Hint } from "@renderer/components/Hint";
import { ProjectIcon } from "./ProjectIcon";

export interface IdentifyReport {
  matches: ILocalIdentifyMatch[];
  fileNames: Map<string, string>;
  total: number;
  unavailable: Provider[];
}

const PROVIDER_NAMES: Partial<Record<Provider, string>> = {
  [Provider.CURSEFORGE]: "CurseForge",
  [Provider.MODRINTH]: "Modrinth",
};

export function IdentifyLocalDialog({
  report,
  onClose,
  onLink,
}: {
  report: IdentifyReport;
  onClose: () => void;
  onLink: (matches: ILocalIdentifyMatch[]) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(report.matches.map((match) => match.key)),
  );

  const chosen = useMemo(
    () => report.matches.filter((match) => selected.has(match.key)),
    [report.matches, selected],
  );

  const notFound = report.total - report.matches.length;
  const allSelected = selected.size === report.matches.length;
  const unavailable = report.unavailable
    .map((provider) => PROVIDER_NAMES[provider])
    .filter(Boolean)
    .join(", ");

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("modManager.identifyTitle")}</DialogTitle>
          <DialogDescription>{t("modManager.identifyHint")}</DialogDescription>
        </DialogHeader>

        <div className="flex h-7 items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() =>
              setSelected(
                allSelected
                  ? new Set()
                  : new Set(report.matches.map((match) => match.key)),
              )
            }
          >
            {t(allSelected ? "modManager.clearSelection" : "modManager.selectAll")}
          </Button>
          <span className="ml-auto font-mono text-xs tabular-nums text-faint">
            {t("modManager.identifyFound", {
              found: report.matches.length,
              total: report.total,
            })}
          </span>
        </div>

        <div className="-mx-1 max-h-[19rem] min-h-0 overflow-y-auto px-1">
          <div className="flex flex-col gap-1">
            {report.matches.map((match) => {
              const isSelected = selected.has(match.key);
              const fileName = report.fileNames.get(match.key) ?? "";

              return (
                <button
                  key={match.key}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => toggle(match.key)}
                  className="flex h-14 w-full min-w-0 items-center gap-2.5 rounded-lg bg-surface-2 px-2.5 text-left transition-colors hover:bg-surface-3"
                >
                  <Checkbox
                    checked={isSelected}
                    aria-label={match.project.title}
                    className="pointer-events-none shrink-0"
                  />

                  <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-1 text-faint">
                    <ProjectIcon
                      src={match.project.iconUrl}
                      size={36}
                      fallback={<FileBox className="size-4" />}
                    />
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {match.provider === Provider.CURSEFORGE ? (
                        <SiCurseforge className="size-3 shrink-0 text-faint" />
                      ) : (
                        <SiModrinth className="size-3 shrink-0 text-faint" />
                      )}
                      <Hint content={match.project.title} variant="text" truncatedOnly>
                        <span className="truncate text-sm leading-4 text-foreground">
                          {match.project.title}
                        </span>
                      </Hint>
                      <span className="shrink-0 truncate font-mono text-[0.6875rem] text-faint">
                        {match.version.versionNumber || match.version.name}
                      </span>
                    </div>
                    <Hint content={fileName} variant="text" truncatedOnly>
                      <span className="flex min-w-0 items-center gap-1 text-xs leading-4 text-faint">
                        <ArrowRight className="size-3 shrink-0" />
                        <span className="truncate">{fileName}</span>
                      </span>
                    </Hint>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {(notFound > 0 || unavailable) && (
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            {notFound > 0 && (
              <p>{t("modManager.identifyNotFound", { count: notFound })}</p>
            )}
            {unavailable && (
              <p className="flex items-center gap-1.5 text-warning">
                <CircleAlert className="size-3.5 shrink-0" />
                {t("modManager.identifyUnavailable", { providers: unavailable })}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={chosen.length === 0}
            onClick={() => {
              onLink(chosen);
              onClose();
            }}
          >
            {t("modManager.identifyLink", { count: chosen.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
