import { useTranslation } from "react-i18next";
import {
  Copy,
  Gamepad2,
  Loader2,
  PackageCheck,
  PackageMinus,
  PackageSearch,
  Pencil,
  RefreshCw,
  Trash,
  TriangleAlert,
  Users,
  Zap,
} from "lucide-react";
import { IServer } from "@/types/ServersList";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { FactRow, FactRows } from "@renderer/components/FactRows";
import { cn } from "@/lib/utils";
import { MotdText, ServerFavicon } from "./ServerVisuals";
import { parseMotd, stripMotd } from "./motd";
import { ServerCompatibility, checkServerCompatibility } from "./compat";
import { describePingError } from "./ping";
import type { ServerPingState } from "./types";

const TEXTURE_ICON = {
  ask: PackageSearch,
  on: PackageCheck,
  off: PackageMinus,
} as const;

function texturesKind(value: number | null | undefined) {
  if (value === null || value === undefined) return "ask" as const;
  return value ? ("on" as const) : ("off" as const);
}

function texturesIndex(value: number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return value ? 1 : 2;
}

const TEXTURE_OPTIONS: (number | null)[] = [null, 1, 0];

export function ServerDetails({
  server,
  status,
  instanceVersion,
  isQuickConnect,
  canQuickConnect,
  readOnly,
  canPlay,
  onPlay,
  onEdit,
  onDelete,
  onCopy,
  onRecheck,
  onChangeTextures,
  onToggleQuickConnect,
}: {
  server: IServer;
  status?: ServerPingState;
  instanceVersion?: string;
  isQuickConnect: boolean;
  canQuickConnect: boolean;
  readOnly: boolean;
  canPlay: boolean;
  onPlay: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onRecheck: () => void;
  onChangeTextures: (value: number | null) => void;
  onToggleQuickConnect: () => void;
}) {
  const { t } = useTranslation();

  const result = status?.result;
  const spans = parseMotd(result?.descriptionRaw);
  const compatibility: ServerCompatibility = checkServerCompatibility(
    result?.versionName,
    instanceVersion,
  );

  const checkedAt =
    status && status.state !== "pending" && status.checkedAt
      ? new Date(status.checkedAt).toLocaleTimeString()
      : null;

  const rows: { label: string; value: string }[] = [
    {
      label: t("servers.players"),
      value: result?.players
        ? `${result.players.online}/${result.players.max}`
        : "—",
    },
    {
      label: t("servers.latency"),
      value:
        status?.state === "online" && result?.latencyMs !== undefined
          ? `${result.latencyMs} ${t("servers.ms")}`
          : "—",
    },
    {
      label: t("servers.version"),
      value: stripMotd(result?.versionName) || "—",
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <div className="flex min-w-0 items-start gap-3">
          <ServerFavicon icon={result?.favicon ?? server.icon} size={48} />
          <div className="min-w-0 flex-1">
            <Hint content={server.name} variant="text" truncatedOnly>
              <p className="truncate text-sm font-semibold">{server.name}</p>
            </Hint>
            {(result?.modded || result?.secureChat === false) && (
              <span className="mt-0.5 mb-0.5 flex flex-wrap gap-1">
                {result.modded && (
                  <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
                    {t("servers.modded")}
                  </span>
                )}
                {result.secureChat === false && (
                  <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
                    {t("servers.unsignedChat")}
                  </span>
                )}
              </span>
            )}
            <Hint content={t("servers.copyAddress")}>
              <button
                type="button"
                onClick={onCopy}
                aria-label={t("servers.copyAddress")}
                className="group flex min-w-0 max-w-full items-center gap-1 text-left"
              >
                <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                  {server.ip}
                </span>
                <Copy className="size-3 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            </Hint>
          </div>
        </div>

        {status?.state === "pending" ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {t("servers.checking")}
          </p>
        ) : spans.length ? (
          <MotdText spans={spans} lines={2} className="text-xs leading-5" />
        ) : status?.state === "offline" ? (
          <div className="grid gap-1.5 rounded-lg border border-border bg-surface-1 px-2.5 py-2">
            <p className="text-xs text-muted-foreground">
              {t(`servers.pingError.${describePingError(result?.error)}`)}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={onRecheck}
            >
              <RefreshCw className="size-3.5" />
              {t("servers.recheck")}
            </Button>
          </div>
        ) : null}

        <FactRows surface="card" framed className="shrink-0">
          {rows.map((row) => (
            <FactRow
              key={row.label}
              label={row.label}
              value={
                <span className="min-w-0 truncate font-mono tabular-nums">
                  {row.value}
                </span>
              }
            />
          ))}
        </FactRows>

        {compatibility === "mismatch" && (
          <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-surface-1 px-2.5 py-2 text-xs text-warning">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {t("servers.incompatible", {
                server: stripMotd(result?.versionName),
                instance: instanceVersion,
              })}
            </span>
          </p>
        )}

        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">
            {t("servers.resources")}
          </span>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-1 p-1">
            {TEXTURE_OPTIONS.map((option, index) => {
              const Icon = TEXTURE_ICON[texturesKind(option)];
              const active = texturesIndex(server.acceptTextures) === index;

              return (
                <button
                  key={String(option)}
                  type="button"
                  disabled={readOnly}
                  aria-pressed={active}
                  onClick={() => onChangeTextures(option)}
                  className={cn(
                    "flex h-7 items-center justify-center gap-1 rounded-md text-[0.7rem] transition-colors disabled:pointer-events-none disabled:opacity-50",
                    active
                      ? "bg-surface-3 text-foreground"
                      : "text-muted-foreground hover:bg-surface-2",
                  )}
                >
                  <Icon className="size-3" />
                  <span className="truncate">
                    {t(`servers.resourceSets.${index}`)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {result?.players?.sample?.length ? (
          <div className="grid gap-1.5">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="size-3.5" />
              {t("servers.playersOnline")}
            </span>
            <div className="flex flex-wrap gap-1">
              {result.players.sample.slice(0, 12).map((player) => (
                <span
                  key={player.name}
                  className="max-w-full truncate rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[0.7rem]"
                >
                  {stripMotd(player.name)}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {checkedAt && (
          <p className="text-[0.65rem] text-faint">
            {t("servers.checkedAt", { time: checkedAt })}
          </p>
        )}

        {canQuickConnect && (
          <button
            type="button"
            disabled={readOnly}
            onClick={onToggleQuickConnect}
            aria-pressed={isQuickConnect}
            className={cn(
              "flex items-center justify-between gap-3 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors disabled:pointer-events-none disabled:opacity-50",
              isQuickConnect
                ? "border-warning/40 bg-warning/10 text-warning"
                : "hover:bg-accent/40",
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Zap className="size-3.5 shrink-0" />
              <span className="truncate">{t("servers.quickConnect")}</span>
            </span>
            <span className="shrink-0 text-[0.7rem] text-faint">
              {isQuickConnect
                ? t("servers.quickConnectOn")
                : t("servers.quickConnectOff")}
            </span>
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t bg-surface-1 px-3 py-2.5">
        <Button
          size="sm"
          variant="secondary"
          className="h-9 flex-1"
          disabled={!canPlay}
          onClick={onPlay}
        >
          <Gamepad2 className="size-4" />
          {t("servers.join")}
        </Button>
        <Hint content={t("common.edit")}>
          <Button
            variant="outline"
            size="icon-sm"
            className="size-9"
            disabled={readOnly}
            aria-label={t("common.edit")}
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
        </Hint>
        <Hint content={t("common.delete")}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            disabled={readOnly}
            aria-label={t("common.delete")}
            onClick={onDelete}
          >
            <Trash className="size-3.5" />
          </Button>
        </Hint>
      </div>
    </div>
  );
}
