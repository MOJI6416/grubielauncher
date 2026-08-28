import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { Download } from "lucide-react";
import { IServer } from "@/types/ServersList";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { selectedVersionAtom, versionsAtom } from "@renderer/stores/atoms";
import { ServerFavicon } from "./ServerVisuals";
import { findDuplicateAddress, normalizeAddress } from "./serverList";

const api = window.api;

interface Candidate {
  instance: string;
  server: IServer;
  key: string;
}

export function ServerImport({
  servers,
  onImport,
  onClose,
}: {
  servers: IServer[];
  onImport: (servers: IServer[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const versions = useAtomValue(versionsAtom);
  const selectedVersion = useAtomValue(selectedVersionAtom);

  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const others = versions
        .map((entry) => entry.version)
        .filter((entry) => entry.name !== selectedVersion?.version.name);

      const groups = others.length ? await api.servers.versions(others) : [];
      if (cancelled) return;

      const found: Candidate[] = [];
      const seen = new Set<string>();

      for (const group of groups) {
        for (const server of (group.servers ?? []) as IServer[]) {
          if (!server?.ip) continue;
          if (findDuplicateAddress(servers, server.ip) >= 0) continue;

          const key = normalizeAddress(server.ip);
          if (seen.has(key)) continue;
          seen.add(key);

          found.push({ instance: group.version, server, key });
        }
      }

      setCandidates(found);
    })();

    return () => {
      cancelled = true;
    };
  }, [versions, selectedVersion, servers]);

  const chosen = useMemo(
    () => (candidates ?? []).filter((entry) => picked[entry.key]),
    [candidates, picked],
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        className="overflow-hidden p-0 sm:max-w-md"
      >
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Download className="size-4" />
            {t("servers.importTitle")}
          </DialogTitle>
        </DialogHeader>

        {candidates === null ? (
          <div
            aria-busy
            className="flex flex-col gap-1 px-3 py-2 [&_[data-slot=skeleton]]:bg-surface-1"
          >
            {[0, 1, 2, 3].map((row) => (
              <div
                key={row}
                className="flex min-w-0 items-center gap-2.5 px-2 py-1.5"
              >
                <Skeleton className="size-4 shrink-0 rounded" />
                <Skeleton className="size-7 shrink-0 rounded-md" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3 w-32 rounded" />
                  <Skeleton className="h-2.5 w-24 rounded" />
                </div>
                <Skeleton className="h-2.5 w-16 shrink-0 rounded" />
              </div>
            ))}
          </div>
        ) : !candidates.length ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            {t("servers.importEmpty")}
          </p>
        ) : (
          <ScrollArea className="max-h-72">
            <div className="flex flex-col gap-1 px-3 py-2">
              {candidates.map((entry) => (
                <label
                  key={entry.key}
                  className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/40"
                >
                  <Checkbox
                    checked={picked[entry.key] === true}
                    onCheckedChange={(checked) =>
                      setPicked((prev) => ({
                        ...prev,
                        [entry.key]: checked === true,
                      }))
                    }
                  />
                  <ServerFavicon icon={entry.server.icon} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {entry.server.name}
                    </span>
                    <span className="block truncate font-mono text-[0.7rem] text-faint">
                      {entry.server.ip}
                    </span>
                  </span>
                  <span className="max-w-28 shrink-0 truncate text-[0.7rem] text-muted-foreground">
                    {entry.instance}
                  </span>
                </label>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="m-0 rounded-none border-t bg-surface-1 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            disabled={!chosen.length}
            onClick={() =>
              onImport(
                chosen.map((entry) => ({
                  name: entry.server.name,
                  ip: entry.server.ip,
                  icon: entry.server.icon,
                  acceptTextures: entry.server.acceptTextures ?? null,
                })),
              )
            }
          >
            <Download className="size-3.5" />
            {t("servers.importAction", { count: chosen.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
