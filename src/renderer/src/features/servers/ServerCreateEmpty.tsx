import { useTranslation } from "react-i18next";
import { Loader2, ServerCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export function ServerCreateEmpty({
  blockedReason,
  isInstalling,
  onCreate,
}: {
  blockedReason?: string;
  isInstalling: boolean;
  onCreate: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Empty className="h-full border border-dashed border-border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ServerCog />
        </EmptyMedia>
        <EmptyTitle>{t("versions.serverEmpty.title")}</EmptyTitle>
        <EmptyDescription className="max-w-md">
          {t("versions.serverEmpty.hint")}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          variant="outline"
          disabled={!!blockedReason || isInstalling}
          onClick={onCreate}
        >
          {isInstalling ? <Loader2 className="animate-spin" /> : <ServerCog />}
          {t("versions.serverInstall")}
        </Button>
        {blockedReason && (
          <p className="text-xs text-faint">{blockedReason}</p>
        )}
      </EmptyContent>
    </Empty>
  );
}
