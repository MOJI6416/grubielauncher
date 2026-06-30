import { IAddedLocalProject, IProject } from "@/types/ModManager";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlertTriangle, Compass, FileBox, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";

const api = window.api;

export function ALPModal({
  onClose,
  projects,
  addProjects,
}: {
  onClose: () => void;
  projects: IAddedLocalProject[];
  addProjects: (projects: IProject[]) => void | Promise<void>;
}) {
  const { t } = useTranslation();

  const [isLoading, setIsLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const initial = new Set(
      projects.filter((p) => p.status === "valid").map((p) => p.project.id),
    );
    setSelected(initial);
  }, [projects]);

  const selectedCount = selected.size;
  const validCount = projects.filter((p) => p.status === "valid").length;

  const selectedProjects = useMemo(() => {
    if (selected.size === 0) return [];
    return projects
      .filter((p) => selected.has(p.project.id))
      .map((p) => p.project);
  }, [projects, selected]);

  const toggle = useCallback((id: string, isSelected: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (isSelected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleAdd = useCallback(async () => {
    if (isLoading || selected.size === 0) return;

    setIsLoading(true);
    try {
      await addProjects(selectedProjects);
      onClose();
    } finally {
      setIsLoading(false);
    }
  }, [
    isLoading,
    selected.size,
    addProjects,
    selectedProjects,
    onClose,
    selected,
  ]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isLoading) onClose();
      }}
    >
      <DialogContent aria-describedby={undefined}
        className="overflow-hidden p-0 sm:max-w-md"
        onPointerDownOutside={(event) => {
          if (isLoading) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isLoading) event.preventDefault();
        }}
      >
        <DialogHeader className="border-b py-4 pr-12 pl-5">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <DialogTitle className="flex min-w-0 items-center gap-2 leading-6">
              <FileBox className="size-5 shrink-0" />
              <span className="truncate">
                {t("modManager.addingProjects")}
              </span>
            </DialogTitle>
            <Badge variant="secondary" className="shrink-0 tabular-nums">
              {selectedCount}/{validCount}
            </Badge>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[min(28rem,60vh)] px-5 py-4 pr-6">
          <TooltipProvider>
            <div className="flex flex-col gap-2">
              {projects.map((p) => {
                const id = p.project.id;
                const isValid = p.status === "valid";
                const isDuplicate = p.status === "duplicate";
                const isInvalid = p.status === "invalid";
                const inputId = `local-project-${id}`;

                const tooltipText = isDuplicate
                  ? t("modManager.modDuplicate")
                  : isInvalid
                    ? t("modManager.modInvalid")
                    : "";
                return (
                  <Tooltip
                    key={id}
                    open={isValid || tooltipText === "" ? false : undefined}
                  >
                    <TooltipTrigger asChild>
                      <Card
                        className={`py-0 transition-colors ${
                          isValid
                            ? "hover:bg-accent/40"
                            : "border-border/60 bg-muted/30 opacity-80"
                        }`}
                      >
                        <CardContent className="flex items-center gap-3 p-3">
                          <Checkbox
                            id={inputId}
                            disabled={!isValid || isLoading}
                            checked={selected.has(id)}
                            onCheckedChange={(checked) =>
                              toggle(id, checked === true)
                            }
                          />

                          {p.project.iconUrl ? (
                            <img
                              height={48}
                              width={48}
                              className="size-12 shrink-0 rounded-lg object-cover"
                              src={p.project.iconUrl}
                              alt={p.project.title}
                            />
                          ) : (
                            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-muted/30 text-muted-foreground">
                              <FileBox className="size-5" />
                            </div>
                          )}

                          <label
                            htmlFor={inputId}
                            className="min-w-0 flex-1 cursor-pointer"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <p className="min-w-0 truncate font-medium text-foreground">
                                {p.project.title}
                              </p>
                              {!isValid && (
                                <span
                                  className={`inline-flex size-6 shrink-0 items-center justify-center rounded-md border ${
                                    isInvalid
                                      ? "border-destructive/40 bg-destructive/15 text-destructive"
                                      : "border-amber-500/40 bg-amber-500/15 text-amber-300"
                                  }`}
                                  title={tooltipText}
                                  aria-label={tooltipText}
                                >
                                  <AlertTriangle className="size-3.5" />
                                </span>
                              )}
                            </div>

                            {p.project.description && (
                              <p className="line-clamp-2 min-w-0 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                                {p.project.description}
                              </p>
                            )}
                          </label>

                          {p.project.url && (
                            <Button
                              size="icon-sm"
                              variant="secondary"
                              className="shrink-0"
                              disabled={isLoading}
                              onClick={() =>
                                api.shell.openExternal(p.project.url!)
                              }
                            >
                              <Compass size={18} />
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    </TooltipTrigger>
                    {tooltipText !== "" && !isValid && (
                      <TooltipContent>{tooltipText}</TooltipContent>
                    )}
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        </ScrollArea>

        <DialogFooter className="mx-0 mb-0 flex-row justify-end gap-2 rounded-none rounded-b-xl border-t bg-muted/25 px-5 py-4 sm:gap-2">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            {t("common.cancel")}
          </Button>

          <Button
            disabled={isLoading || selectedCount === 0}
            onClick={handleAdd}
          >
            {isLoading && <Loader2 className="animate-spin" />}
            {t("common.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
