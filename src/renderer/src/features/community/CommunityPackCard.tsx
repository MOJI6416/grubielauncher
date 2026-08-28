import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Download, Package } from "lucide-react";
import type { IModpackCard } from "@/types/Backend";
import { Hint } from "@renderer/components/Hint";
import { LoaderLabel } from "@renderer/components/Loaders";
import { PlayerHead } from "@renderer/features/accounts/AccountHead";
import { formatCompactNumber } from "@renderer/features/mods/format";
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
            <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[0.6rem] text-muted-foreground">
              {t("newInstance.alreadyInstalled")}
            </span>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-1.5 text-[0.7rem] text-muted-foreground">
          <PlayerHead
            user={{
              nickname: pack.owner.nickname,
              headUrl: pack.owner.imageUrl,
            }}
            size={14}
            className="rounded-[3px]"
          />
          <Hint content={pack.owner.nickname} variant="text" truncatedOnly>
            <span className="max-w-40 shrink-0 truncate">
              {pack.owner.nickname}
            </span>
          </Hint>
          <LoaderLabel loader={pack.loader.name} className="shrink-0" />
          <span className="shrink-0 font-mono tabular-nums text-faint">
            {pack.minecraftVersion}
          </span>
          {updated && (
            <Hint content={updatedAt ? formatDay(updatedAt) : ""}>
              <span className="shrink-0 text-faint">
                {t("ownModpacks.updated", { when: updated })}
              </span>
            </Hint>
          )}
          {pack.description && (
            <Hint content={pack.description} variant="text" truncatedOnly>
              <p className="min-w-0 flex-1 truncate text-faint">
                {pack.description}
              </p>
            </Hint>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        {parts.length > 0 ? (
          parts.map((part) => (
            <span
              key={part.key}
              className="flex h-5 shrink-0 items-center rounded-md bg-surface-3 px-1.5 text-[0.65rem] text-muted-foreground"
            >
              {t(`community.content.${part.key}`)}
              <span className="ml-1 font-mono tabular-nums text-faint">
                {part.value}
              </span>
            </span>
          ))
        ) : (
          <span className="shrink-0 text-[0.65rem] text-faint">
            {t("community.contentEmpty")}
          </span>
        )}

        {downloads && (
          <Hint content={t("addVersion.preview.installs")}>
            <span className="flex w-12 shrink-0 items-center justify-end gap-1 font-mono text-[0.7rem] tabular-nums text-faint">
              <Download className="size-3" />
              {downloads}
            </span>
          </Hint>
        )}

        {action}
      </div>
    </article>
  );
}
