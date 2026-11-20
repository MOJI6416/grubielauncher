import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Download, Package } from "lucide-react";
import type { IModpackCard } from "@/types/Backend";
import { Hint } from "@renderer/components/Hint";
import { LoaderLabel } from "@renderer/components/Loaders";
import { AuthorLink } from "@renderer/features/profile/AuthorLink";
import { formatCompactNumber } from "@renderer/utilities/numbers";
import { formatDay, formatRelative } from "@renderer/utilities/date";
import { packContentParts } from "./exploreQuery";

export function CommunityPackCard({
  pack,
  language,
  action,
  isInstalled,
}: {
  pack: IModpackCard;
  language: string;
  action: ReactNode;
  isInstalled?: boolean;
}) {
  const { t } = useTranslation();

  const downloads = formatCompactNumber(pack.downloads, language);
  const parts = packContentParts(pack.summary);
  const updatedAt = pack.lastUpdate ? new Date(pack.lastUpdate) : null;
  const updated = updatedAt ? formatRelative(updatedAt) : "";

  return (
    <article className="flex h-16 min-w-0 items-center gap-2.5 rounded-xl bg-surface-1 px-2.5">
      <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-3">
        {pack.imageUrl ? (
          <img
            src={pack.imageUrl}
            alt=""
            width={44}
            height={44}
            loading="lazy"
            draggable={false}
            className="size-full object-cover"
          />
        ) : (
          <Package className="size-4 text-faint" />
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <Hint content={pack.name} variant="text" truncatedOnly>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {pack.name}
            </span>
          </Hint>

          {isInstalled && (
            <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-3xs text-muted-foreground">
              {t("newInstance.alreadyInstalled")}
            </span>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
          <AuthorLink
            author={{
              id: pack.owner.id || null,
              nickname: pack.owner.nickname,
              headUrl: pack.owner.imageUrl,
            }}
            headClassName="rounded-[3px]"
            className="max-w-40 shrink-0"
          />
          <span aria-hidden className="shrink-0 text-faint">
            ·
          </span>
          <LoaderLabel loader={pack.loader.name} className="shrink-0" />
          <span className="shrink-0 font-mono tabular-nums text-faint">
            {pack.minecraftVersion}
          </span>
          {pack.description && (
            <>
              <span aria-hidden className="shrink-0 text-faint">
                ·
              </span>
              <Hint content={pack.description} variant="text" truncatedOnly>
                <p className="min-w-0 flex-1 truncate text-faint">
                  {pack.description}
                </p>
              </Hint>
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        {parts.length > 0 ? (
          parts.map((part) => (
            <span
              key={part.key}
              className="flex h-5 shrink-0 items-center rounded-md bg-surface-3 px-1.5 text-3xs text-muted-foreground"
            >
              {t(`community.content.${part.key}`)}
              <span className="ml-1 font-mono tabular-nums text-faint">
                {part.value}
              </span>
            </span>
          ))
        ) : (
          <span className="shrink-0 text-3xs text-faint">
            {t("community.contentEmpty")}
          </span>
        )}

        {(downloads || updated) && (
          <span className="flex shrink-0 flex-col items-end gap-0.5 text-2xs whitespace-nowrap text-faint">
            {downloads && (
              <Hint content={t("addVersion.preview.installs")}>
                <span className="flex items-center gap-1 font-mono tabular-nums">
                  <Download className="size-3" />
                  {downloads}
                </span>
              </Hint>
            )}
            {updated && (
              <Hint content={updatedAt ? formatDay(updatedAt) : ""}>
                <span>{updated}</span>
              </Hint>
            )}
          </span>
        )}

        {action}
      </div>
    </article>
  );
}
