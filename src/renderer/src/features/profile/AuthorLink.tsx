import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { IUser } from "@/types/IUser";
import { Hint } from "@renderer/components/Hint";
import { PlayerHead } from "@renderer/features/accounts/AccountHead";
import { navigate } from "@renderer/navigation/navigate";

export function AuthorLink({
  author,
  size = 14,
  headClassName,
  className,
}: {
  author: {
    id?: string | null;
    nickname: string;
    platform?: IUser["platform"] | null;
    headUrl?: string | null;
    publicProfile?: boolean | null;
  };
  size?: number;
  headClassName?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const content = (
    <>
      <PlayerHead
        user={{
          id: author.id,
          nickname: author.nickname,
          platform: author.platform,
          headUrl: author.headUrl,
        }}
        size={size}
        className={headClassName}
      />
      <span className="min-w-0 truncate">{author.nickname}</span>
    </>
  );

  if (!author.id || author.publicProfile === false) {
    return (
      <Hint content={author.nickname} variant="text" truncatedOnly>
        <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
          {content}
        </span>
      </Hint>
    );
  }

  const userId = author.id;
  const label = `${author.nickname} · ${t("accounts.openProfile")}`;

  return (
    <Hint content={label}>
      <button
        type="button"
        aria-label={label}
        onClick={() => navigate({ name: "profile", userId })}
        className={cn(
          "flex min-w-0 items-center gap-1.5 rounded-sm text-left underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
          className,
        )}
      >
        {content}
      </button>
    </Hint>
  );
}
