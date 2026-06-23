import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { IConsole } from "@/types/Console";
import { RunGameParams } from "@renderer/App";
import { consolesAtom, versionsAtom } from "@renderer/stores/atoms";
import { useAtom } from "jotai";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Copy,
  RotateCcw,
  Search,
  Square,
  Terminal,
  Trash2,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const api = window.api;

interface IInstance {
  versionName: string;
  instance: number;
}

function getKey(v: string, i: number) {
  return `${v}::${i}`;
}

function formatElapsed(startTime: number) {
  const diff = Date.now() - new Date(startTime).getTime();
  const seconds = Math.floor(diff / 1000) % 60;
  const minutes = Math.floor(diff / 1000 / 60) % 60;
  const hours = Math.floor(diff / 1000 / 60 / 60);

  return (
    `${hours.toString().padStart(2, "0")}:` +
    `${minutes.toString().padStart(2, "0")}:` +
    `${seconds.toString().padStart(2, "0")}`
  );
}

function getStatusMeta(
  status: IConsole["status"],
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (status === "running") {
    return {
      label: t("console.running"),
      Icon: Circle,
      badgeClassName: "border-primary/40 bg-primary/10 text-primary",
      dotClassName: "bg-primary",
    };
  }

  if (status === "stopped") {
    return {
      label: t("console.stopped"),
      Icon: CheckCircle2,
      badgeClassName: "border-border bg-secondary text-secondary-foreground",
      dotClassName: "bg-muted-foreground",
    };
  }

  return {
    label: t("console.error"),
    Icon: AlertTriangle,
    badgeClassName: "border-destructive/40 bg-destructive/10 text-destructive",
    dotClassName: "bg-destructive",
  };
}

export function Console({
  onClose,
  runGame,
}: {
  onClose: () => void;
  runGame: (params: RunGameParams) => Promise<void>;
}) {
  const [consoles, setConsoles] = useAtom(consolesAtom);
  const [versions] = useAtom(versionsAtom);
  const [selectedInstance, setSelectedInstance] = useState<IInstance | null>(
    null,
  );
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, string>>({});

  const { t } = useTranslation();

  const viewportRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);
  const consolesRef = useRef(consoles.consoles);

  useEffect(() => {
    consolesRef.current = consoles.consoles;
  }, [consoles.consoles]);

  const versionsByName = useMemo(() => {
    return new Map(versions.map((version) => [version.version.name, version]));
  }, [versions]);

  const instances = useMemo<IInstance[]>(() => {
    return consoles.consoles.map((c) => ({
      versionName: c.versionName,
      instance: c.instance,
    }));
  }, [consoles.consoles]);

  const selectedConsole = useMemo<IConsole | null>(() => {
    if (!selectedInstance) return null;

    return (
      consoles.consoles.find(
        (c) =>
          c.versionName === selectedInstance.versionName &&
          c.instance === selectedInstance.instance,
      ) || null
    );
  }, [selectedInstance, consoles.consoles]);

  const selectedVersion = selectedConsole
    ? versionsByName.get(selectedConsole.versionName)
    : undefined;

  const [consoleFilter, setConsoleFilter] = useState<
    "all" | "info" | "error" | "success"
  >("all");
  const [consoleSearch, setConsoleSearch] = useState("");

  const typeCounts = useMemo(() => {
    const msgs = selectedConsole?.messages ?? [];
    let info = 0;
    let error = 0;
    let success = 0;
    for (const m of msgs) {
      if (m.type === "error") error += 1;
      else if (m.type === "success") success += 1;
      else info += 1;
    }
    return { all: msgs.length, info, error, success };
  }, [selectedConsole]);

  const visibleMessages = useMemo(() => {
    const msgs = selectedConsole?.messages ?? [];
    const query = consoleSearch.trim().toLowerCase();
    return msgs
      .map((message, index) => ({ message, index }))
      .filter(({ message }) => {
        if (consoleFilter !== "all") {
          const type =
            message.type === "error" || message.type === "success"
              ? message.type
              : "info";
          if (type !== consoleFilter) return false;
        }
        if (query && !message.message.toLowerCase().includes(query))
          return false;
        return true;
      });
  }, [selectedConsole, consoleFilter, consoleSearch]);

  useEffect(() => {
    if (instances.length === 0) {
      setSelectedInstance(null);
      return;
    }

    const currentKey = selectedInstance
      ? getKey(selectedInstance.versionName, selectedInstance.instance)
      : null;
    const exists = currentKey
      ? instances.some((i) => getKey(i.versionName, i.instance) === currentKey)
      : false;

    if (exists) return;

    const running = consoles.consoles.find((c) => c.status === "running");
    const next = running || consoles.consoles[0];
    setSelectedInstance({
      versionName: next.versionName,
      instance: next.instance,
    });
  }, [instances, consoles.consoles, selectedInstance]);

  useEffect(() => {
    const interval = setInterval(() => {
      const next: Record<string, string> = {};

      consolesRef.current.forEach(
        ({ versionName, instance, startTime, status }) => {
          if (status !== "running" || !startTime) return;
          next[getKey(versionName, instance)] = formatElapsed(startTime);
        },
      );

      setElapsedTimes(next);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  function scrollToBottom() {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight });
  }

  function handleScroll() {
    const el = viewportRef.current;
    if (!el) return;

    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedToBottomRef.current = distanceToBottom < 60;
  }

  useLayoutEffect(() => {
    if (!viewportRef.current) return;
    if (pinnedToBottomRef.current) scrollToBottom();
  }, [selectedInstance, selectedConsole?.messages.length]);

  async function removeConsole(inst: IInstance) {
    const next = consoles.consoles.filter(
      (c) =>
        !(c.versionName === inst.versionName && c.instance === inst.instance),
    );
    setConsoles({ consoles: next });
    if (next.length === 0) onClose();
  }

  async function copyConsoleLogs() {
    if (!selectedConsole) return;
    const text = selectedConsole.messages.map((m) => m.message).join("");
    if (!text) return;
    await api.clipboard.writeText(text);
    toast(t("common.copied"));
  }

  const selectedStatus = selectedConsole
    ? getStatusMeta(selectedConsole.status, t)
    : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="grid h-[min(40rem,calc(100vh-4rem))] w-[min(64rem,calc(100vw-2rem))] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>{t("console.title")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("console.title")}
          </DialogDescription>
        </DialogHeader>

        <TooltipProvider delayDuration={250}>
          <div className="grid min-h-0 min-w-0 grid-cols-[16rem_minmax(0,1fr)]">
            <aside className="min-h-0 min-w-0 border-r bg-card">
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex items-center justify-between border-b bg-muted/20 px-3 py-2.5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("console.instances")}
                  </p>
                  <Badge variant="secondary" className="rounded-md">
                    {instances.length}
                  </Badge>
                </div>

                <ScrollArea className="min-h-0 flex-1">
                  <div className="grid gap-1.5 p-2">
                    {instances.length === 0 ? (
                      <Empty className="min-h-52 border bg-transparent">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <Terminal />
                          </EmptyMedia>
                          <EmptyTitle>{t("console.noInstances")}</EmptyTitle>
                        </EmptyHeader>
                      </Empty>
                    ) : (
                      instances.map((inst) => {
                        const versionConsole = consoles.consoles.find(
                          (c) =>
                            c.versionName === inst.versionName &&
                            c.instance === inst.instance,
                        );
                        if (!versionConsole) return null;

                        const versionItem = versionsByName.get(
                          inst.versionName,
                        );
                        const isSelected =
                          selectedInstance?.versionName === inst.versionName &&
                          selectedInstance.instance === inst.instance;
                        const statusMeta = getStatusMeta(
                          versionConsole.status,
                          t,
                        );

                        return (
                          <button
                            key={getKey(inst.versionName, inst.instance)}
                            type="button"
                            className={cn(
                              "grid min-w-0 gap-2 rounded-lg border bg-background/85 p-2 text-left text-foreground transition-colors outline-none hover:border-primary/35 hover:bg-accent/45 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                              isSelected &&
                                "border-primary/60 bg-accent/70 shadow-sm",
                            )}
                            onClick={() => {
                              setSelectedInstance(inst);
                              pinnedToBottomRef.current = true;
                              requestAnimationFrame(scrollToBottom);
                            }}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              {versionItem?.version.image ? (
                                <img
                                  src={versionItem.version.image}
                                  alt={inst.versionName}
                                  width={32}
                                  height={32}
                                  className="size-8 shrink-0 rounded-md border bg-muted object-cover"
                                />
                              ) : (
                                <div className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                                  <Terminal className="size-4" />
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <p
                                  className="truncate text-sm font-medium"
                                  title={inst.versionName}
                                >
                                  {inst.versionName}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {t("console.instance")} #{inst.instance}
                                </p>
                              </div>
                            </div>

                            <div className="flex min-w-0 items-center justify-between gap-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "min-w-0 justify-start gap-1.5 rounded-md px-1.5 font-normal",
                                  statusMeta.badgeClassName,
                                )}
                              >
                                <span
                                  className={cn(
                                    "size-1.5 shrink-0 rounded-full",
                                    statusMeta.dotClassName,
                                  )}
                                />
                                <span className="truncate">
                                  {statusMeta.label}
                                </span>
                              </Badge>

                              {versionConsole.status === "running" && (
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {elapsedTimes[
                                    getKey(inst.versionName, inst.instance)
                                  ] || "00:00:00"}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>
            </aside>

            <section className="flex min-h-0 min-w-0 flex-col bg-card">
              <div className="flex min-w-0 items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <Terminal className="size-4 shrink-0 text-muted-foreground" />
                    <p
                      className="truncate text-sm font-medium"
                      title={selectedConsole?.versionName}
                    >
                      {selectedConsole?.versionName || t("console.title")}
                    </p>
                    {selectedConsole && selectedStatus && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 gap-1.5 rounded-md px-1.5 font-normal",
                          selectedStatus.badgeClassName,
                        )}
                      >
                        <selectedStatus.Icon className="size-3" />
                        {selectedStatus.label}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {selectedConsole
                      ? `${t("console.instance")} #${selectedConsole.instance} - ${selectedConsole.messages.length} ${t("console.messages")}`
                      : t("console.noInstances")}
                  </p>
                </div>

                {selectedConsole && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    {selectedConsole.messages.length > 0 && (
                      <Button
                        size="sm"
                        variant="secondary"
                        type="button"
                        onClick={copyConsoleLogs}
                      >
                        <Copy />
                        {t("common.copy")}
                      </Button>
                    )}
                    {selectedConsole.status === "running" ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        type="button"
                        onClick={async () => {
                          await api.game.closeGame(
                            selectedConsole.versionName,
                            selectedConsole.instance,
                          );
                        }}
                      >
                        <Square />
                        {t("console.stop")}
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          type="button"
                          disabled={!selectedVersion}
                          onClick={async () => {
                            if (!selectedVersion) return;
                            await runGame({
                              version: selectedVersion,
                              instance: selectedConsole.instance,
                            });
                          }}
                        >
                          <RotateCcw />
                          {t("console.restart")}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          type="button"
                          onClick={() =>
                            removeConsole({
                              versionName: selectedConsole.versionName,
                              instance: selectedConsole.instance,
                            })
                          }
                        >
                          <Trash2 />
                          {t("console.remove")}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {selectedConsole && selectedConsole.messages.length > 0 && (
                <div className="flex shrink-0 items-center gap-2 border-b bg-muted/10 px-3 py-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={consoleSearch}
                      onChange={(e) => setConsoleSearch(e.target.value)}
                      placeholder={t("console.search")}
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
                    {(
                      [
                        ["all", typeCounts.all],
                        ["info", typeCounts.info],
                        ["error", typeCounts.error],
                        ["success", typeCounts.success],
                      ] as const
                    ).map(([key, count]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setConsoleFilter(key)}
                        className={cn(
                          "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                          consoleFilter === key
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {t(`console.filter.${key}`)}
                        <span className="tabular-nums opacity-70">{count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Card className="m-3 min-h-0 flex-1 overflow-hidden border-border bg-card py-0 shadow-sm">
                <CardContent className="h-full min-h-0 p-0">
                  <div
                    ref={viewportRef}
                    onScroll={handleScroll}
                    className="h-full w-full overflow-auto bg-background p-3 text-foreground"
                  >
                    {!selectedConsole ||
                    selectedConsole.messages.length === 0 ? (
                      <Empty className="h-full min-h-56 border bg-background/80">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <Terminal />
                          </EmptyMedia>
                          <EmptyTitle>{t("console.noMessages")}</EmptyTitle>
                          <EmptyDescription>
                            {t("console.noMessagesDescription")}
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    ) : visibleMessages.length === 0 ? (
                      <div className="flex h-full min-h-56 items-center justify-center text-sm text-muted-foreground">
                        {t("console.noMatches")}
                      </div>
                    ) : (
                      <div className="min-w-0 space-y-2">
                        {visibleMessages.map(({ message, index }) => {
                          const text = message.message.length
                            ? message.message
                            : " ";
                          const hasTips = message.tips.length > 0;

                          return (
                            <Tooltip
                              key={index}
                              open={hasTips ? undefined : false}
                            >
                              <TooltipTrigger asChild>
                                <pre
                                  style={{ tabSize: 4 }}
                                  className={cn(
                                    "m-0 min-w-0 max-w-full overflow-hidden whitespace-pre-wrap rounded-md border border-l-2 bg-card px-3 py-2 font-mono text-[0.72rem] leading-relaxed shadow-xs [overflow-wrap:anywhere]",
                                    hasTips && "cursor-help",
                                    message.type === "info" &&
                                      "border-l-primary/70 text-foreground",
                                    message.type === "error" &&
                                      "border-l-destructive text-destructive",
                                    message.type !== "info" &&
                                      message.type !== "error" &&
                                      "border-l-primary text-foreground",
                                  )}
                                >
                                  {text}
                                </pre>
                              </TooltipTrigger>
                              {hasTips && (
                                <TooltipContent>
                                  {message.tips
                                    .map((tip) => t("tips." + tip))
                                    .join(", ")}
                                </TooltipContent>
                              )}
                            </Tooltip>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </section>
          </div>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}
