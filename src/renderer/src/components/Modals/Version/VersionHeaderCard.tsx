import { useTranslation } from "react-i18next";
import {
  Cpu,
  Gamepad2,
  ImageMinus,
  ImagePlus,
  Pencil,
  Share2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormErrorMessage } from "@/components/ui/form-error-message";
import { Input } from "@/components/ui/input";
import { LoaderLabel } from "@renderer/components/Loaders";
import { Version } from "@renderer/classes/Version";
import { buildPackShareUrl } from "@renderer/utilities/packShare";
import { toast } from "sonner";

const api = window.api;

export function VersionHeaderCard({
  version,
  image,
  versionName,
  editName,
  isNameValid,
  isLoading,
  canRenameVersion,
  canEditLogo,
  onNameChange,
  onStartRename,
  onCancelRename,
  onPickLogo,
  onRemoveLogo,
}: {
  version: Version | undefined;
  image: string;
  versionName: string;
  editName: boolean;
  isNameValid: boolean;
  isLoading: boolean;
  canRenameVersion: boolean;
  canEditLogo: boolean;
  onNameChange: (value: string) => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onPickLogo: () => void;
  onRemoveLogo: () => void;
}) {
  const { t } = useTranslation();
  const versionNameErrorId = "edit-version-name-error";

  const logoInner = image ? (
    <img src={image} alt="logo" className="h-full w-full object-cover" />
  ) : (
    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
      <ImagePlus className="size-5" />
    </div>
  );

  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
      <div className="flex min-w-0 items-start gap-3">
        {canEditLogo ? (
          <button
            type="button"
            className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-muted/40 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none"
            disabled={isLoading}
            onClick={onPickLogo}
            aria-label={t("versions.changeLogo")}
          >
            {logoInner}
            <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <ImagePlus className="size-5" />
            </span>
          </button>
        ) : (
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-muted/40">
            {logoInner}
          </div>
        )}

        <div className="grid min-w-0 flex-1 gap-2">
          {editName ? (
            <div className="grid">
              <Input
                aria-invalid={!isNameValid}
                aria-describedby={!isNameValid ? versionNameErrorId : undefined}
                placeholder={t("versions.namePlaceholder")}
                value={versionName}
                onChange={(event) => onNameChange(event.currentTarget.value)}
                disabled={isLoading}
              />
              <FormErrorMessage show={!isNameValid} id={versionNameErrorId}>
                {t("addVersion.invalidName")}
              </FormErrorMessage>
            </div>
          ) : (
            <p className="truncate text-xl font-semibold">{versionName}</p>
          )}

          {version && (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Badge variant="secondary">
                <Gamepad2 />
                <span className="max-w-40 truncate">
                  {version.version.version.id}
                </span>
              </Badge>

              <Badge variant="secondary">
                <Cpu />
                <LoaderLabel loader={version.version.loader.name} />
                {version.version.loader.name !== "vanilla" && (
                  <span className="max-w-36 truncate">
                    ({version.version.loader.version?.id})
                  </span>
                )}
              </Badge>

              {version.version.shareCode && (
                <Badge
                  variant="outline"
                  asChild
                  className="max-w-full cursor-pointer"
                >
                  <button
                    type="button"
                    onClick={async () => {
                      await api.clipboard.writeText(
                        buildPackShareUrl(version.version.shareCode || ""),
                      );
                      toast(t("common.copied"));
                    }}
                  >
                    <Share2 />
                    <span className="max-w-64 truncate">
                      /{version.version.shareCode}
                    </span>
                  </button>
                </Badge>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {!editName ? (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={isLoading || !canRenameVersion}
              onClick={onStartRename}
            >
              <Pencil />
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={onCancelRename}
            >
              <X />
            </Button>
          )}

          {canEditLogo && image && (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={isLoading}
              onClick={onRemoveLogo}
            >
              <ImageMinus />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
