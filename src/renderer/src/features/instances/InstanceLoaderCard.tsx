import { useTranslation } from "react-i18next";
import { ArrowUp, CircleCheck, Layers, Loader2 } from "lucide-react";
import type { Loader } from "@/types/Loader";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { LoaderIcon, getLoaderInfo } from "@renderer/components/Loaders";
import { SectionCard } from "./SectionCard";

export function InstanceLoaderCard({
  loader,
  currentId,
  minecraftVersion,
  update,
  isChecking,
  catalogFailed,
  isChanging,
  onOpen,
}: {
  loader: Loader;
  currentId?: string;
  minecraftVersion: string;
  update?: string;
  isChecking: boolean;
  catalogFailed: boolean;
  isChanging: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const info = getLoaderInfo(loader);

  const status = isChanging ? (
    <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
      <Loader2 className="size-3 shrink-0 animate-spin" />
      <span className="truncate">{t("loaderUpdate.changing")}</span>
    </span>
  ) : update ? (
    <span className="flex min-w-0 items-center gap-1.5 text-warning">
      <ArrowUp className="size-3 shrink-0" />
      <span className="truncate">
        {t("loaderUpdate.available", { version: update })}
      </span>
    </span>
  ) : isChecking ? (
    <span className="truncate text-faint">{t("loaderUpdate.checking")}</span>
  ) : catalogFailed ? (
    <span className="truncate text-faint">
      {t("loaderUpdate.catalogUnavailable")}
    </span>
  ) : (
    <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
      <CircleCheck className="size-3 shrink-0 text-success" />
      <span className="truncate">{t("loaderUpdate.upToDate")}</span>
    </span>
  );

  return (
    <SectionCard
      title={t("versions.loader")}
      icon={Layers}
      className="shrink-0"
      bodyClassName="flex items-center gap-3 px-3 py-2.5"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2">
        <LoaderIcon loader={loader} className="size-5" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-1.5 text-sm">
          <span className="shrink-0 font-medium">{info.name}</span>
          <Hint content={currentId} variant="text" truncatedOnly>
            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
              {currentId ?? "—"}
            </span>
          </Hint>
          <span className="shrink-0 font-mono text-[0.7rem] text-faint">
            · {minecraftVersion}
          </span>
        </span>
        <span className="text-[0.7rem]">{status}</span>
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0"
        onClick={onOpen}
      >
        {update ? t("loaderUpdate.review") : t("loaderUpdate.change")}
      </Button>
    </SectionCard>
  );
}
