import { useTranslation } from "react-i18next";
import { ArrowUpRight, Newspaper, X } from "lucide-react";
import { ISponsoredNewsAd } from "@/types/News";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { MilestoneBeam } from "@renderer/components/MilestoneBeam";
import { BrandMark } from "@renderer/shell/BrandMark";
import { openReleaseNote } from "@renderer/features/whatsNew/whatsNewStore";
import { formatDate, formatRelative } from "@renderer/utilities/date";
import { NewsCard, NewsSource } from "./feed";

const api = window.api;

const SOURCE_CLASS: Record<NewsSource, string> = {
  grubie: "border-primary/35 bg-primary-soft-raised text-foreground",
  minecraft: "border-border bg-surface-3 text-muted-foreground",
  other: "border-border bg-surface-3 text-muted-foreground",
};

export type NewsCardProps = {
  card: NewsCard;
  isNew: boolean;
  showSource: boolean;
  failed: boolean;
  onFailed: () => void;
};

function openLink(url: string) {
  void api.shell.openExternal(url).catch(() => {});
}

function openCard(card: NewsCard) {
  if (card.release) {
    openReleaseNote(card.release);
    return;
  }

  openLink(card.item.url);
}

function MilestoneChip() {
  const { t } = useTranslation();

  return (
    <span className="flex h-4.5 shrink-0 items-center rounded border border-primary/40 bg-primary-soft-raised px-1.5 text-[0.6rem] font-medium tracking-wide text-foreground uppercase">
      {t("whatsNew.milestone")}
    </span>
  );
}

function SourceChip({ card }: { card: NewsCard }) {
  const { t } = useTranslation();
  const label =
    card.source === "other"
      ? card.host || t("news.sources.other")
      : t(`news.sources.${card.source}`);

  return (
    <span
      className={cn(
        "flex h-4.5 shrink-0 items-center rounded border px-1.5 text-[0.6rem] font-medium tracking-wide uppercase",
        SOURCE_CLASS[card.source],
      )}
    >
      {label}
    </span>
  );
}

function KindChip({ card }: { card: NewsCard }) {
  const { t } = useTranslation();
  if (card.kind === "article") return null;

  return (
    <span className="flex h-4.5 min-w-0 items-center gap-1 rounded border border-border bg-surface-2 px-1.5 text-[0.6rem] font-medium text-muted-foreground">
      <span className="truncate">{t(`news.kinds.${card.kind}`)}</span>
      {card.version && (
        <span className="shrink-0 font-mono tabular-nums text-faint">
          {card.version}
        </span>
      )}
    </span>
  );
}

function Chips({
  card,
  isNew,
  showSource,
}: {
  card: NewsCard;
  isNew: boolean;
  showSource: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {showSource && <SourceChip card={card} />}
      {card.release?.isMilestone && <MilestoneChip />}
      <KindChip card={card} />
      {isNew && <NewBadge />}
    </span>
  );
}

function Meta({
  card,
  className,
  withSummary,
}: {
  card: NewsCard;
  className?: string;
  withSummary?: boolean;
}) {
  const { t } = useTranslation();
  const date = card.time ? new Date(card.time) : null;

  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-[0.65rem] text-faint",
        className,
      )}
    >
      {card.item.author && (
        <>
          <span className="shrink-0 truncate">{card.item.author}</span>
          <span aria-hidden>·</span>
        </>
      )}
      {date ? (
        <Hint content={formatDate(date)} variant="text">
          <span className="shrink-0">{formatRelative(date)}</span>
        </Hint>
      ) : (
        <span className="shrink-0">{t("news.noDate")}</span>
      )}
      {withSummary && card.summary && (
        <>
          <span aria-hidden>·</span>
          <Hint content={card.summary} variant="text" truncatedOnly>
            <span className="min-w-0 flex-1 truncate">{card.summary}</span>
          </Hint>
        </>
      )}
    </span>
  );
}

function NewBadge() {
  const { t } = useTranslation();

  return (
    <span className="flex h-4.5 shrink-0 items-center rounded bg-success/15 px-1.5 text-[0.6rem] font-medium tracking-wide text-success uppercase">
      {t("news.new")}
    </span>
  );
}

type CoverSize = "sm" | "md" | "lg";

const MARK_SIZE: Record<CoverSize, string> = {
  sm: "size-7",
  md: "size-10",
  lg: "size-14",
};

const VERSION_SIZE: Record<CoverSize, string> = {
  sm: "text-[0.65rem]",
  md: "text-xs",
  lg: "text-sm",
};

function Cover({
  card,
  failed,
  onFailed,
  className,
  size = "sm",
}: {
  card: NewsCard;
  failed: boolean;
  onFailed: () => void;
  className?: string;
  size?: CoverSize;
}) {
  if (card.release) {
    return (
      <div
        className={cn(
          "relative flex flex-col items-center gap-1.5 overflow-hidden bg-primary-soft",
          size === "lg" ? "justify-start pt-8" : "justify-center",
          className,
        )}
      >
        <span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-br from-primary/25 via-primary/8 to-transparent"
        />
        <BrandMark
          className={cn("relative shrink-0 text-foreground", MARK_SIZE[size])}
        />
        <span
          className={cn(
            "relative font-mono tabular-nums text-muted-foreground",
            VERSION_SIZE[size],
          )}
        >
          {card.release.version}
        </span>
      </div>
    );
  }

  if (!card.item.image || failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-surface-3",
          className,
        )}
      >
        <Newspaper className="size-5 text-faint" />
      </div>
    );
  }

  return (
    <img
      src={card.item.image}
      alt={card.item.imageAltText || card.item.title}
      loading="lazy"
      draggable={false}
      onError={onFailed}
      className={cn(
        "object-cover select-none transition-transform duration-300 group-hover:scale-[1.03]",
        className,
      )}
    />
  );
}

export function HeroCard({
  card,
  isNew,
  showSource,
  failed,
  onFailed,
}: NewsCardProps) {
  return (
    <button
      type="button"
      onClick={() => openCard(card)}
      className="group relative flex h-full w-full flex-col justify-end overflow-hidden rounded-xl border border-border text-left outline-none transition-colors hover:border-primary/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      {card.release?.isMilestone && <MilestoneBeam />}

      <Cover
        card={card}
        failed={failed}
        onFailed={onFailed}
        size="lg"
        className="absolute inset-0 size-full"
      />
      <span
        aria-hidden
        className={cn(
          "absolute inset-0",
          card.release
            ? "bg-gradient-to-t from-background from-25% via-background/80 via-45% to-transparent to-62%"
            : "bg-gradient-to-t from-background via-background/80 to-background/10",
        )}
      />

      <ArrowUpRight className="absolute top-3 right-3 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />

      <span className="relative flex min-w-0 flex-col gap-1.5 p-3.5">
        <Chips card={card} isNew={isNew} showSource={showSource} />

        <span className="line-clamp-2 text-lg leading-6 font-semibold text-foreground">
          {card.item.title}
        </span>

        {card.summary && (
          <span className="line-clamp-2 text-xs leading-4 text-muted-foreground">
            {card.summary}
          </span>
        )}

        <Meta card={card} />
      </span>
    </button>
  );
}

export function ListCard({
  card,
  isNew,
  showSource,
  failed,
  onFailed,
}: NewsCardProps) {
  return (
    <button
      type="button"
      onClick={() => openCard(card)}
      className="group relative flex h-[4.5rem] w-full min-w-0 items-stretch gap-2.5 overflow-hidden rounded-xl border border-border bg-card p-1.5 text-left outline-none transition-colors hover:border-primary/40 hover:bg-surface-3 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      {card.release?.isMilestone && <MilestoneBeam />}

      <Cover
        card={card}
        failed={failed}
        onFailed={onFailed}
        className="h-full w-[5.5rem] shrink-0 overflow-hidden rounded-lg"
      />

      <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 pr-1">
        <Chips card={card} isNew={isNew} showSource={showSource} />
        <span className="line-clamp-2 text-xs leading-4 font-medium">
          {card.item.title}
        </span>
        <Meta card={card} withSummary />
      </span>
    </button>
  );
}

export function GridCard({
  card,
  isNew,
  showSource,
  failed,
  onFailed,
}: NewsCardProps) {
  return (
    <button
      type="button"
      onClick={() => openCard(card)}
      className="group relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-left outline-none transition-colors hover:border-primary/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      {card.release?.isMilestone && <MilestoneBeam />}

      <span className="relative block h-[6.5rem] w-full shrink-0 overflow-hidden">
        <Cover
          card={card}
          failed={failed}
          onFailed={onFailed}
          size="md"
          className="absolute inset-0 size-full"
        />
        <span className="absolute inset-x-1.5 top-1.5">
          <Chips card={card} isNew={isNew} showSource={showSource} />
        </span>
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1 p-2.5">
        <span className="line-clamp-2 min-h-8 text-xs leading-4 font-medium">
          {card.item.title}
        </span>
        {card.summary && (
          <span className="line-clamp-2 text-[0.7rem] leading-4 text-muted-foreground">
            {card.summary}
          </span>
        )}
        <Meta card={card} className="mt-auto pt-0.5" />
      </span>
    </button>
  );
}

export function SponsoredCard({
  ad,
  failed,
  onFailed,
  onHide,
}: {
  ad: ISponsoredNewsAd;
  failed: boolean;
  onFailed: () => void;
  onHide: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="group relative flex h-[4.5rem] min-w-0 items-stretch gap-2.5 overflow-hidden rounded-xl border border-dashed border-border bg-card p-1.5">
      <button
        type="button"
        onClick={() => {
          void api.backend.recordSponsoredAdClick(ad.id).catch(() => {});
          openLink(ad.targetUrl);
        }}
        className="flex min-w-0 flex-1 items-stretch gap-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
      >
        {ad.image && !failed ? (
          <img
            src={ad.image}
            alt=""
            loading="lazy"
            draggable={false}
            onError={onFailed}
            className="h-full w-[5.5rem] shrink-0 rounded-lg object-cover select-none"
          />
        ) : (
          <span className="flex h-full w-[5.5rem] shrink-0 items-center justify-center rounded-lg bg-surface-3">
            <Newspaper className="size-5 text-faint" />
          </span>
        )}

        <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 pr-7">
          <span className="flex h-4.5 w-fit shrink-0 items-center rounded border border-border bg-surface-3 px-1.5 text-[0.6rem] font-medium tracking-wide text-faint uppercase">
            {t("app.sponsored")}
          </span>
          <span className="line-clamp-2 text-xs leading-4 font-medium">
            {ad.title}
          </span>
          <span className="flex min-w-0 items-center gap-1 text-[0.65rem] text-faint">
            <span className="min-w-0 truncate">{ad.cta}</span>
            <ArrowUpRight className="size-3 shrink-0" />
          </span>
        </span>
      </button>

      <Hint content={t("app.hideAd")}>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={t("app.hideAd")}
          onClick={onHide}
          className="absolute top-1.5 right-1.5 text-faint"
        >
          <X className="size-3" />
        </Button>
      </Hint>
    </div>
  );
}
