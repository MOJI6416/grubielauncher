import { DragEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CopyPlus, Play } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Version } from "@renderer/classes/Version";
import { Hint } from "@renderer/components/Hint";
import { LoaderLabel } from "@renderer/components/Loaders";
import { formatRelative } from "@renderer/utilities/date";
import { resolveLocalImage } from "@renderer/utilities/localMedia";
import { countMods } from "./contentCounts";
import { InstanceArt, loaderTint } from "./InstanceArt";
import { InstanceStatusChip } from "./InstanceStatusChip";
import { InstanceUpdateBadge } from "./InstanceUpdateBadge";
import { InstanceStatusKind } from "./instanceStatus";
import { formatPlaytime } from "./playtime";

export interface InstanceCardProps {
  instance: Version;
  itemKey: string;
  active: boolean;
  statuses: InstanceStatusKind[];
  tags: string[];
  playtime?: number;
  lastLaunchedAt: Date | null;
  ownerNickname?: string;
  ownerImage?: string;
  canPlay: boolean;
  menu: ReactNode;
  onSelect: () => void;
  onOpen: () => void;
  onPlay: () => void;
  dragProps: {
    draggable?: boolean;
    onDragStart?: (event: DragEvent<HTMLElement>) => void;
    onDragEnd?: () => void;
    onDragOver?: (event: DragEvent<HTMLElement>) => void;
    onDrop?: (event: DragEvent<HTMLElement>) => void;
  };
}

function OwnerMark({
  nickname,
  image,
  className,
}: {
  nickname: string;
  image?: string;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Avatar
          className={cn("size-4 bg-surface-3 ring-2 ring-surface-2", className)}
        >
          {image && <AvatarImage src={image} alt={nickname} />}
          <AvatarFallback className="text-[0.5rem]">
            {nickname.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </TooltipTrigger>
      <TooltipContent>
        {t("versions.ownerTooltip", { nickname })}
      </TooltipContent>
    </Tooltip>
  );
}

function TileBackdrop({ instance }: { instance: Version }) {
  const source = resolveLocalImage(instance.version.image);

  if (!source) {
    return (
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-b to-transparent",
          loaderTint(instance.version.loader.name),
        )}
      />
    );
  }

  return (
    <>
      <img
        src={source}
        alt=""
        aria-hidden
        draggable={false}
        loading="lazy"
        decoding="async"
        className="pointer-events-none absolute inset-0 size-full scale-125 object-cover opacity-45 blur-md select-none"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/25 to-background/60"
      />
    </>
  );
}

function Meta({
  instance,
  tags,
  className,
}: {
  instance: Version;
  tags: string[];
  className?: string;
}) {
  const { t } = useTranslation();
  const modsCount = countMods(instance.version.loader.mods);
  const tagList = tags.map((tag) => `#${tag}`).join(" ");

  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-2 text-[0.7rem] text-faint",
        className,
      )}
    >
      <LoaderLabel
        className="shrink-0"
        loader={instance.version.loader.name}
      />
      <span className="shrink-0 font-mono">{instance.version.version.id}</span>
      {modsCount > 0 && (
        <span className="shrink-0">
          {t("modManager.modsCount", { count: modsCount })}
        </span>
      )}
      {tags.length > 0 && (
        <Hint content={tagList} variant="text" truncatedOnly>
          <span className="truncate">{tagList}</span>
        </Hint>
      )}
    </span>
  );
}

export function InstanceRow(props: InstanceCardProps) {
  const { t } = useTranslation();
  const isRunning = props.statuses.includes("running");
  const playLabel = isRunning
    ? t("versions.playAnotherInstance")
    : t("nav.play");

  return (
    <div
      role="option"
      tabIndex={0}
      aria-selected={props.active}
      aria-label={props.instance.version.name}
      onClick={props.onSelect}
      onDoubleClick={props.onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          props.onOpen();
        }
        if (event.key === " ") {
          event.preventDefault();
          props.onSelect();
        }
      }}
      className={cn(
        "group relative flex h-14 cursor-pointer items-center gap-3 rounded-xl px-2.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        props.active ? "bg-primary-soft" : "bg-surface-2 hover:bg-surface-3",
      )}
      {...props.dragProps}
    >
      {props.active && (
        <span className="absolute top-3 bottom-3 left-0 w-0.75 rounded-full bg-primary" />
      )}

      <div className="relative shrink-0">
        <InstanceArt
          name={props.instance.version.name}
          image={props.instance.version.image}
          className="size-10 rounded-lg text-xs"
        />
        {props.ownerNickname && (
          <OwnerMark
            nickname={props.ownerNickname}
            image={props.ownerImage}
            className="absolute -right-1 -bottom-1"
          />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Hint
          content={props.instance.version.name}
          variant="text"
          truncatedOnly
        >
          <span className="truncate text-sm font-medium text-foreground">
            {props.instance.version.name}
          </span>
        </Hint>
        <Meta instance={props.instance} tags={props.tags} />
      </div>

      {props.statuses
        .slice(0, 1)
        .map((kind) =>
          kind === "update" ? (
            <InstanceUpdateBadge
              key={kind}
              itemKey={props.itemKey}
              isDownloaded={props.instance.version.downloadedVersion}
              onOpen={props.onOpen}
            />
          ) : (
            <InstanceStatusChip key={kind} kind={kind} />
          ),
        )}

      <span className="hidden w-20 shrink-0 text-right font-mono text-[0.7rem] text-muted-foreground tabular-nums xl:block">
        {formatPlaytime(props.playtime, { h: t("time.h"), m: t("time.m") }, "")}
      </span>

      <span className="w-24 shrink-0 text-right font-mono text-[0.7rem] text-faint">
        {props.lastLaunchedAt
          ? formatRelative(props.lastLaunchedAt)
          : t("versions.never")}
      </span>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Hint content={playLabel}>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!props.canPlay}
            aria-label={`${playLabel} — ${props.instance.version.name}`}
            onClick={(event) => {
              event.stopPropagation();
              props.onPlay();
            }}
          >
            {isRunning ? <CopyPlus /> : <Play />}
          </Button>
        </Hint>
        {props.menu}
      </div>
    </div>
  );
}

export function InstanceTile(props: InstanceCardProps) {
  const { t } = useTranslation();
  const isRunning = props.statuses.includes("running");
  const playLabel = isRunning
    ? t("versions.playAnotherInstance")
    : t("nav.play");

  return (
    <article
      role="option"
      tabIndex={0}
      aria-selected={props.active}
      aria-label={props.instance.version.name}
      onClick={props.onSelect}
      onDoubleClick={props.onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          props.onOpen();
        }
        if (event.key === " ") {
          event.preventDefault();
          props.onSelect();
        }
      }}
      className={cn(
        "group relative flex h-38 cursor-pointer flex-col overflow-hidden rounded-xl bg-surface-2 text-left transition-colors hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none",
        props.active && "bg-primary-soft",
      )}
      {...props.dragProps}
    >
      {props.active && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 rounded-xl ring-2 ring-primary ring-inset"
        />
      )}

      <div className="relative h-23 shrink-0 overflow-hidden bg-surface-3">
        <TileBackdrop instance={props.instance} />

        <InstanceArt
          name={props.instance.version.name}
          image={props.instance.version.image}
          className="absolute top-1/2 left-1/2 size-13 -translate-x-1/2 -translate-y-1/2 rounded-xl text-base shadow-lg shadow-background/40 ring-1 ring-border/60"
        />

        <div className="absolute inset-0 flex items-center justify-center gap-1 bg-background/70 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <Hint content={playLabel}>
            <Button
              variant="ghost"
              size="icon"
              disabled={!props.canPlay}
              aria-label={`${playLabel} — ${props.instance.version.name}`}
              onClick={(event) => {
                event.stopPropagation();
                props.onPlay();
              }}
            >
              {isRunning ? <CopyPlus /> : <Play />}
            </Button>
          </Hint>
          {props.menu}
        </div>

        <div className="absolute bottom-1.5 left-1.5 flex gap-1">
          {props.statuses
            .slice(0, 1)
            .map((kind) =>
              kind === "update" ? (
                <InstanceUpdateBadge
                  key={kind}
                  itemKey={props.itemKey}
                  isDownloaded={props.instance.version.downloadedVersion}
                  onOpen={props.onOpen}
                />
              ) : (
                <InstanceStatusChip
                  key={kind}
                  kind={kind}
                  className="pointer-events-none"
                />
              ),
            )}
        </div>

        {props.ownerNickname && (
          <OwnerMark
            nickname={props.ownerNickname}
            image={props.ownerImage}
            className="absolute top-1.5 right-1.5 ring-surface-3"
          />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-2.5">
        <Hint
          content={props.instance.version.name}
          variant="text"
          truncatedOnly
        >
          <span className="truncate text-[0.8rem] font-medium text-foreground">
            {props.instance.version.name}
          </span>
        </Hint>
        <Meta instance={props.instance} tags={props.tags} />
      </div>
    </article>
  );
}
