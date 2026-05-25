import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  ExternalLink,
  Eye,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  areBlockedModsReady,
  applyBlockedModFilePaths,
  checkBlockedMods,
  type IBlockedMod,
} from "@renderer/utilities/blockedMods";

export { applyBlockedModFilePaths, areBlockedModsReady, checkBlockedMods };
export type { IBlockedMod };

const api = window.api;

export function BlockedMods({
  onClose,
  mods,
}: {
  onClose: (mods: IBlockedMod[]) => void;
  mods: IBlockedMod[];
}) {
  const [blockedMods, setBlockedMods] = useState<IBlockedMod[]>(mods);
  const [viewMode, setViewMode] = useState<"all" | "notInstalled">(
    "notInstalled",
  );

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const { t } = useTranslation();

  const checkDownloadedFiles = useCallback(
    async (downloadsPath: string) => {
      try {
        const files = await api.fs.readdir(downloadsPath);
        const availableFiles = new Set(files);

        const nextMods = await Promise.all(
          blockedMods.map(async (mod) => {
            if (availableFiles.has(mod.fileName)) {
              const filePath = await api.path.join(downloadsPath, mod.fileName);
              const hash = await api.fs.sha1(filePath);

              if (hash === mod.hash) {
                return mod.filePath === filePath ? mod : { ...mod, filePath };
              }
            }

            if (mod.filePath) {
              const isExists = await api.fs.pathExists(mod.filePath);
              if (!isExists) return { ...mod, filePath: undefined };
            }

            return mod;
          }),
        );

        const hasChanges = nextMods.some((mod, index) => {
          const prev = blockedMods[index];
          return (
            mod.filePath !== prev.filePath ||
            mod.fileName !== prev.fileName ||
            mod.hash !== prev.hash
          );
        });

        if (hasChanges && isMountedRef.current) {
          setBlockedMods(nextMods);
        }
      } catch (error) {
        console.error("Error checking downloaded files:", error);
      }
    },
    [blockedMods],
  );

  useEffect(() => {
    isMountedRef.current = true;

    api.other.getPath("downloads").then((path: string) => {
      if (!isMountedRef.current) return;

      intervalRef.current = setInterval(() => {
        checkDownloadedFiles(path);
      }, 1000);
    });

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [checkDownloadedFiles]);

  useEffect(() => {
    const notInstalledMods = blockedMods.filter((mod) => !mod.filePath);
    if (notInstalledMods.length === 0) {
      onClose(blockedMods);
    }
  }, [blockedMods, onClose]);

  const filteredMods = useMemo(() => {
    return blockedMods.filter((mod) => {
      if (viewMode === "all") return true;
      return !mod.filePath;
    });
  }, [blockedMods, viewMode]);

  const installedCount = useMemo(() => {
    return blockedMods.filter((mod) => !!mod.filePath).length;
  }, [blockedMods]);

  const missingCount = blockedMods.length - installedCount;

  const handleToggleView = useCallback(() => {
    setViewMode((prev) => (prev === "all" ? "notInstalled" : "all"));
  }, []);

  const handleOpenAll = useCallback(async () => {
    const modsToOpen = blockedMods.filter((mod) => !mod.filePath);
    for (const mod of modsToOpen) {
      try {
        await api.shell.openExternal(mod.url);
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error("Error opening URL:", error);
      }
    }
  }, [blockedMods]);

  const handleClose = useCallback(() => {
    onClose([]);
  }, [onClose]);

  return (
    <Dialog open>
      <DialogContent
        className="overflow-hidden p-0 sm:max-w-lg"
        showCloseButton={false}
        onClick={(event) => event.stopPropagation()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>{t("blockedMods.title")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 px-5 pb-5">
          <Alert className="border-border/70 bg-muted/20 text-muted-foreground">
            <ShieldAlert />
            <AlertDescription>{t("blockedMods.description")}</AlertDescription>
          </Alert>

          <section className="grid gap-3 rounded-xl border bg-card p-3 text-card-foreground">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <p className="text-sm font-medium leading-none">
                  {t("blockedMods.files")}
                </p>
                <Badge variant="outline" className="tabular-nums">
                  {installedCount}/{blockedMods.length}
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={installedCount === 0}
                  onClick={handleToggleView}
                >
                  <Eye />
                  {viewMode === "all"
                    ? t("blockedMods.showMissing")
                    : t("blockedMods.showAll")}
                </Button>
              </div>
            </div>

            <ScrollArea className="max-h-[18rem] rounded-xl border bg-background/40">
              <div className="grid gap-2 p-2">
                {filteredMods.map((mod) => (
                  <Card
                    key={`${mod.projectId}-${mod.fileName}`}
                    className="gap-0 py-0 shadow-none"
                  >
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="grid min-w-0 flex-1 gap-1">
                        <div className="flex min-w-0 items-center gap-2">
                          {mod.filePath ? (
                            <CheckCircle2 className="size-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <TriangleAlert className="size-4 shrink-0 text-destructive" />
                          )}
                          <p
                            className="min-w-0 truncate text-sm font-medium"
                            title={mod.fileName}
                          >
                            {mod.fileName}
                          </p>
                          {mod.filePath ? (
                            <span
                              className="size-2.5 shrink-0 rounded-full bg-emerald-500"
                              aria-label={t("blockedMods.ready")}
                              title={t("blockedMods.ready")}
                            />
                          ) : (
                            <span
                              className="size-2.5 shrink-0 rounded-full bg-destructive"
                              aria-label={t("blockedMods.missing")}
                              title={t("blockedMods.missing")}
                            />
                          )}
                        </div>
                      </div>

                      {!mod.filePath && (
                        <Button
                          size="icon-sm"
                          variant="secondary"
                          className="shrink-0"
                          aria-label={t("game.download")}
                          title={t("game.download")}
                          onClick={async () => {
                            try {
                              await api.shell.openExternal(mod.url);
                            } catch (error) {
                              console.error("Error opening URL:", error);
                            }
                          }}
                        >
                          <ExternalLink />
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}

                {filteredMods.length === 0 && (
                  <div className="flex h-24 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                    {t("blockedMods.empty")}
                  </div>
                )}
              </div>
            </ScrollArea>
          </section>
        </div>

        <DialogFooter className="m-0 border-t bg-muted/25 px-5 py-4">
          <Button
            variant="outline"
            onClick={handleOpenAll}
            disabled={missingCount === 0}
          >
            <ExternalLink />
            {t("blockedMods.openAll")}
          </Button>
          <Button variant="destructive" onClick={handleClose}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
