import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SiCurseforge, SiModrinth } from "react-icons/si";
import {
  ExternalLink,
  FolderInput,
  Loader2,
  PackageSearch,
  Radar,
  Server,
  Signal,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import grubieIcon from "@renderer/assets/icon.png";
import prismIcon from "@renderer/assets/launchers/prism.svg";
import multimcIcon from "@renderer/assets/launchers/multimc.svg";
import type { IModpack as IBackendModpack } from "@/types/Backend";
import { ServerFavicon } from "@renderer/features/servers/ServerVisuals";
import type { ServerProbe } from "./useServerProbe";
import type { KnownServer, OwnModpacksState } from "./useSuggestions";

const api = window.api;

function SourceShell({
  icon,
  title,
  description,
  children,
  hints,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
  hints?: string[];
}) {
  return (
    <div className="m-auto flex w-full max-w-xl flex-col items-center gap-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface-2 text-muted-foreground">
        {icon}
      </span>

      <div className="grid gap-1 text-center">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {children}

      {hints && hints.length > 0 && (
        <div className="grid w-full gap-1.5 rounded-xl border border-border bg-surface-1 p-2.5">
          {hints.map((hint) => (
            <p key={hint} className="flex items-start gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-faint" />
              <span className="min-w-0 text-[0.7rem] leading-snug text-muted-foreground">
                {hint}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function LauncherTile({
  name,
  format,
  children,
}: {
  name: string;
  format: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-1 rounded-lg border border-border bg-surface-1 p-2 text-center">
      <span className="mx-auto flex size-7 items-center justify-center">
        {children}
      </span>
      <span className="truncate text-[0.68rem] leading-4 font-medium text-foreground">
        {name}
      </span>
      <span className="text-[0.6rem] leading-3 text-faint uppercase">
        {format}
      </span>
    </div>
  );
}

export function FileSource({
  isBusy,
  onPick,
}: {
  isBusy: boolean;
  onPick: () => void;
}) {
  const { t } = useTranslation();

  return (
    <SourceShell
      icon={<FolderInput className="size-5" />}
      title={t("addVersion.tabs.fromFile")}
      description={t("addVersion.dropDescription")}
      hints={[t("addVersion.help.fromFile.2"), t("addVersion.help.fromFile.3")]}
    >
      <div className="grid w-full grid-cols-5 gap-2">
        <LauncherTile name="Grubie" format="zip">
          <img src={grubieIcon} alt="" className="size-5 object-contain" />
        </LauncherTile>
        <LauncherTile name="CurseForge" format="zip">
          <SiCurseforge className="size-5 text-[#f16436]" />
        </LauncherTile>
        <LauncherTile name="Modrinth" format="mrpack">
          <SiModrinth className="size-5 text-[#1bd96a]" />
        </LauncherTile>
        <LauncherTile name="Prism" format="zip">
          <img src={prismIcon} alt="" className="size-5 object-contain" />
        </LauncherTile>
        <LauncherTile name="MultiMC" format="zip">
          <img src={multimcIcon} alt="" className="size-5 object-contain" />
        </LauncherTile>
      </div>

      <Button
        type="button"
        variant="secondary"
        className="h-9 w-full"
        disabled={isBusy}
        onClick={onPick}
      >
        {isBusy ? <Loader2 className="animate-spin" /> : <FolderInput />}
        {t("newInstance.chooseFile")}
      </Button>
    </SourceShell>
  );
}

export function CodeSource({
  value,
  onChange,
  onSearch,
  onPickOwn,
  onOpenInstalled,
  own,
  isBusy,
  isBackendOnline,
  offlineReason,
}: {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  onPickOwn: (modpack: IBackendModpack) => void;
  onOpenInstalled: (instanceKey: string) => void;
  own: OwnModpacksState;
  isBusy: boolean;
  isBackendOnline: boolean;
  offlineReason: string | null;
}) {
  const { t } = useTranslation();
  const canSearch = value.trim() !== "" && !isBusy && isBackendOnline;

  return (
    <SourceShell
      icon={<PackageSearch className="size-5" />}
      title={t("addVersion.fromServer.shareCode")}
      description={t("addVersion.help.fromServer.1")}
      hints={
        offlineReason
          ? [offlineReason]
          : own.items.length > 0
            ? undefined
            : [
                t("addVersion.help.fromServer.2"),
                t("addVersion.help.fromServer.3"),
              ]
      }
    >
      <div className="flex w-full items-center gap-2">
        <Input
          className="h-9 flex-1 font-mono"
          placeholder="grubielauncher.com/pack/…"
          value={value}
          disabled={isBusy}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canSearch) onSearch();
          }}
        />
        <Button
          type="button"
          variant="secondary"
          className="h-9"
          disabled={!canSearch}
          onClick={onSearch}
        >
          {isBusy ? <Loader2 className="animate-spin" /> : <PackageSearch />}
          {t("addVersion.fromServer.find")}
        </Button>
      </div>

      <button
        type="button"
        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => {
          void api.shell.openExternal("https://grubielauncher.com/packs");
        }}
      >
        <ExternalLink className="size-3" />
        {t("addVersion.fromServer.browsePublic")}
      </button>

      {(own.items.length > 0 || own.isLoading) && (
        <section className="flex max-h-56 w-full flex-col overflow-hidden rounded-xl border border-border bg-surface-1">
          <header className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2.5">
            <span className="text-[0.65rem] font-semibold tracking-[0.08em] text-faint uppercase">
              {t("newInstance.ownPacks")}
            </span>
            {own.isLoading && (
              <Loader2 className="size-3 animate-spin text-faint" />
            )}
          </header>

          <ul className="min-h-0 flex-1 overflow-y-auto p-1">
            {own.items.map((pack) => {
              const installedKey = own.installed.get(pack._id);

              return (
                <li key={pack._id}>
                  <Hint
                    content={
                      installedKey
                        ? t("newInstance.openInstalled")
                        : pack.conf.name
                    }
                    wrapperClassName="w-full"
                  >
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        installedKey
                          ? onOpenInstalled(installedKey)
                          : onPickOwn(pack)
                      }
                      className="flex h-10 w-full items-center gap-2 rounded-lg px-1.5 text-left transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-2 text-[0.6rem] font-semibold text-faint">
                        {pack.conf.image ? (
                          <img
                            src={pack.conf.image}
                            alt=""
                            draggable={false}
                            className="size-full object-cover"
                          />
                        ) : (
                          pack.conf.name.slice(0, 2).toUpperCase()
                        )}
                      </span>

                      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                        {pack.conf.name}
                      </span>

                      <span className="shrink-0 font-mono text-[0.65rem] text-faint">
                        {pack.conf.version.id}
                      </span>

                      {installedKey && (
                        <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[0.6rem] text-muted-foreground">
                          {t("newInstance.alreadyInstalled")}
                        </span>
                      )}
                    </button>
                  </Hint>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </SourceShell>
  );
}

export function ServerSource({
  value,
  onChange,
  onProbe,
  onUse,
  probe,
  isBusy,
  known,
}: {
  value: string;
  onChange: (value: string) => void;
  onProbe: () => void;
  onUse: () => void;
  probe: ServerProbe;
  isBusy: boolean;
  known: KnownServer[];
}) {
  const { t } = useTranslation();
  const canProbe = value.trim() !== "" && !isBusy;

  return (
    <SourceShell
      icon={<Server className="size-5" />}
      title={t("newInstance.server.title")}
      description={t("newInstance.server.description")}
      hints={[t("newInstance.server.hint1"), t("newInstance.server.hint2")]}
    >
      <div className="flex w-full items-center gap-2">
        <Input
          className="h-9 flex-1 font-mono"
          placeholder="mc.example.com"
          value={value}
          disabled={isBusy}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canProbe) onProbe();
          }}
        />
        <Button
          type="button"
          variant="secondary"
          className="h-9"
          disabled={!canProbe}
          onClick={onProbe}
        >
          {isBusy ? <Loader2 className="animate-spin" /> : <Radar />}
          {t("newInstance.server.probe")}
        </Button>
      </div>

      {probe.status !== "idle" && (
        <div
          className={cn(
            "grid w-full gap-2 rounded-xl border p-2.5",
            probe.status === "offline"
              ? "border-destructive/40 bg-surface-1"
              : "border-border bg-surface-1",
          )}
        >
          {probe.status === "offline" ? (
            <p className="text-xs text-destructive">
              {t("newInstance.server.offline")}
            </p>
          ) : (
            <>
              <div className="flex min-w-0 items-center gap-2">
                {probe.favicon ? (
                  <ServerFavicon icon={probe.favicon} size={20} />
                ) : (
                  <span className="size-2 shrink-0 rounded-full bg-success" />
                )}
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                  {probe.motd || probe.address}
                </span>
                {typeof probe.latencyMs === "number" && (
                  <span className="flex shrink-0 items-center gap-1 font-mono text-[0.7rem] tabular-nums text-faint">
                    <Signal className="size-3" />
                    {probe.latencyMs} {t("servers.ms")}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {probe.versionName && (
                  <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[0.7rem] text-muted-foreground">
                    {probe.versionName}
                  </span>
                )}
                {probe.players && (
                  <span className="flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[0.7rem] text-muted-foreground">
                    <Users className="size-3" />
                    <span className="font-mono tabular-nums">
                      {probe.players.online}/{probe.players.max}
                    </span>
                  </span>
                )}
                {probe.modded && (
                  <span className="rounded-md bg-warning/15 px-1.5 py-0.5 text-[0.7rem] text-warning">
                    {t("newInstance.server.modded")}
                  </span>
                )}
              </div>

              {probe.minecraftVersion ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-8 w-full"
                  onClick={onUse}
                >
                  {t("newInstance.server.use", {
                    version: probe.minecraftVersion,
                  })}
                </Button>
              ) : (
                <p className="text-[0.7rem] text-muted-foreground">
                  {t("newInstance.server.unknownVersion")}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {known.length > 0 && probe.status === "idle" && (
        <section className="flex max-h-44 w-full flex-col overflow-hidden rounded-xl border border-border bg-surface-1">
          <header className="flex h-8 shrink-0 items-center border-b border-border px-2.5">
            <span className="text-[0.65rem] font-semibold tracking-[0.08em] text-faint uppercase">
              {t("newInstance.server.known")}
            </span>
          </header>

          <ul className="min-h-0 flex-1 overflow-y-auto p-1">
            {known.map((server) => (
              <li key={server.ip}>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onChange(server.ip)}
                  className="flex h-8 w-full items-center gap-2 rounded-lg px-1.5 text-left transition-colors hover:bg-surface-3 disabled:cursor-not-allowed"
                >
                  <Server className="size-3 shrink-0 text-faint" />
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                    {server.name}
                  </span>
                  <span className="min-w-0 shrink-0 truncate font-mono text-[0.65rem] text-faint">
                    {server.ip}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </SourceShell>
  );
}
