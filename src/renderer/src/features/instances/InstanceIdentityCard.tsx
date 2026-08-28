import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Copy,
  ImageMinus,
  ImagePlus,
  Pencil,
  Share2,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Version } from "@renderer/classes/Version";
import { Hint } from "@renderer/components/Hint";
import { LoaderLabel } from "@renderer/components/Loaders";
import { buildPackShareUrl } from "@renderer/utilities/packShare";
import { resolveLocalImage } from "@renderer/utilities/localMedia";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  instanceNameMessage,
  type InstanceNameCheck,
} from "@renderer/features/newInstance/nameValidation";
import { InstanceArt } from "./InstanceArt";
import { shortenPath } from "./instanceOverview";
import { copyToClipboard } from "@renderer/utilities/clipboard";

export interface IdentityStat {
  id: string;
  label: string;
  value: string;
  onSelect?: () => void;
}

function StatCell({ stat }: { stat: IdentityStat }) {
  const content = (
    <>
      <span className="truncate text-[0.62rem] leading-tight text-faint">
        {stat.label}
      </span>
      <span className="truncate text-[0.82rem] leading-tight font-semibold tabular-nums">
        {stat.value}
      </span>
    </>
  );

  if (!stat.onSelect) {
    return (
      <div className="flex min-w-0 flex-col gap-0.5 rounded-lg px-2 py-1">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={stat.onSelect}
      className="flex min-w-0 flex-col gap-0.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {content}
    </button>
  );
}

export function InstanceIdentityCard({
  instance,
  image,
  versionName,
  editName,
  nameCheck,
  isLoading,
  canRename,
  canEditLogo,
  statuses,
  stats,
  onNameChange,
  onStartRename,
  onCancelRename,
  onCommitRename,
  onPickLogo,
  onRemoveLogo,
}: {
  instance: Version;
  image: string;
  versionName: string;
  editName: boolean;
  nameCheck: InstanceNameCheck;
  isLoading: boolean;
  canRename: boolean;
  canEditLogo: boolean;
  statuses?: ReactNode;
  stats: IdentityStat[];
  onNameChange: (value: string) => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onCommitRename: () => void;
  onPickLogo: () => void;
  onRemoveLogo: () => void;
}) {
  const { t } = useTranslation();
  const nameErrorId = "instance-name-error";
  const shareCode = instance.version.shareCode;
  const cover = resolveLocalImage(image);
  const isNameValid = nameCheck.ok;
  const nameProblem = instanceNameMessage(nameCheck, t);

  return (
    <div className="relative flex shrink-0 items-center gap-3.5 overflow-hidden rounded-2xl border border-border bg-card p-3">
      {cover && (
        <>
          <img
            src={cover}
            alt=""
            aria-hidden
            draggable={false}
            className="pointer-events-none absolute inset-0 size-full object-cover opacity-30 blur-[6px] select-none"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-card via-card/85 to-card/55" />
        </>
      )}

      <div className="relative shrink-0">
        <InstanceArt
          eager
          name={instance.version.name}
          image={image}
          className="size-16 rounded-xl"
          textClassName="text-lg"
        />

        {canEditLogo && (
          <div className="absolute -right-1.5 -bottom-1.5 flex gap-1">
            <Hint content={t("versions.changeLogo")}>
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                className="size-6 rounded-full shadow"
                disabled={isLoading}
                aria-label={t("versions.changeLogo")}
                onClick={onPickLogo}
              >
                <ImagePlus />
              </Button>
            </Hint>
            {image && (
              <Hint content={t("versions.removeLogo")}>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="secondary"
                  className="size-6 rounded-full shadow"
                  disabled={isLoading}
                  aria-label={t("versions.removeLogo")}
                  onClick={onRemoveLogo}
                >
                  <ImageMinus />
                </Button>
              </Hint>
            )}
          </div>
        )}
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col gap-1">
        {editName ? (
          <div className="grid max-w-md gap-1">
            <div className="flex items-center gap-1.5">
              <Input
                autoFocus
                aria-invalid={!isNameValid}
                aria-describedby={!isNameValid ? nameErrorId : undefined}
                placeholder={t("versions.namePlaceholder")}
                value={versionName}
                disabled={isLoading}
                onChange={(event) => onNameChange(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && isNameValid) onCommitRename();
                  if (event.key === "Escape") onCancelRename();
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                disabled={!isNameValid}
                aria-label={t("common.ok")}
                onClick={onCommitRename}
              >
                <Check />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t("common.cancel")}
                onClick={onCancelRename}
              >
                <X />
              </Button>
            </div>
            <div className="flex h-5 min-w-0 items-center gap-2">
              {!isNameValid && (
                <>
                  <Hint content={nameProblem} variant="text" truncatedOnly>
                    <span
                      id={nameErrorId}
                      aria-live="polite"
                      className="min-w-0 truncate text-xs text-destructive"
                    >
                      {nameProblem}
                    </span>
                  </Hint>
                  {nameCheck.suggestion && (
                    <button
                      type="button"
                      className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-primary transition-colors hover:bg-primary-soft"
                      onClick={() => onNameChange(nameCheck.suggestion)}
                    >
                      <Wand2 className="size-3" />
                      {nameCheck.suggestion}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-1.5">
            <Hint content={versionName} variant="text" truncatedOnly>
              <h2 className="min-w-0 truncate text-xl leading-tight font-bold tracking-tight">
                {versionName}
              </h2>
            </Hint>
            {canRename && (
              <Hint content={t("common.rename")}>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="shrink-0 text-faint"
                  disabled={isLoading}
                  aria-label={t("common.rename")}
                  onClick={onStartRename}
                >
                  <Pencil />
                </Button>
              </Hint>
            )}
            {statuses}
          </div>
        )}

        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <LoaderLabel loader={instance.version.loader.name} />
          <span className="font-mono">{instance.version.version.id}</span>
          {instance.version.loader.name !== "vanilla" &&
            instance.version.loader.version?.id && (
              <Hint
                content={instance.version.loader.version.id}
                variant="text"
                truncatedOnly
              >
                <span className="max-w-40 truncate font-mono text-faint">
                  {instance.version.loader.version.id}
                </span>
              </Hint>
            )}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2 text-[0.7rem] text-faint">
          <button
            type="button"
            dir="rtl"
            aria-label={instance.versionPath}
            className="max-w-72 truncate rounded font-mono transition-colors hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={async () => {
              if (!(await copyToClipboard(instance.versionPath))) return;
              toast(t("common.copied"));
            }}
          >
            <bdi>{shortenPath(instance.versionPath)}</bdi>
          </button>

          {shareCode && (
            <Hint
              variant="text"
              content={
                <span className="grid gap-0.5 text-left">
                  <span className="font-mono">
                    {buildPackShareUrl(shareCode)}
                  </span>
                  <span className="text-[0.65rem] opacity-65">
                    {t("versions.copyShareLink")}
                  </span>
                </span>
              }
            >
              <button
                type="button"
                aria-label={t("versions.copyShareLink")}
                className="flex max-w-64 items-center gap-1 rounded font-mono transition-colors hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={async () => {
                  if (!(await copyToClipboard(buildPackShareUrl(shareCode)))) return;
                  toast(t("common.copied"));
                }}
              >
                <Share2 className="size-3 shrink-0" />
                <span className="truncate">/{shareCode}</span>
                <Copy className="size-3 shrink-0" />
              </button>
            </Hint>
          )}
        </div>
      </div>

      {stats.length > 0 && (
        <div
          className={cn(
            "relative grid w-[286px] shrink-0 grid-cols-2 gap-x-1 gap-y-0.5 rounded-xl border border-border bg-surface-2 p-1",
          )}
        >
          {stats.map((stat) => (
            <StatCell key={stat.id} stat={stat} />
          ))}
        </div>
      )}
    </div>
  );
}
