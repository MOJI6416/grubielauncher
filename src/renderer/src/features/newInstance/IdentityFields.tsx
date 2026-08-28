import { useTranslation } from "react-i18next";
import { ImageOff, ImagePlus, Trash2, Wand2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { resolveLocalImage } from "@renderer/utilities/localMedia";
import {
  INSTANCE_NAME_MAX,
  instanceNameMessage,
  type InstanceNameCheck,
} from "./nameValidation";

export function IdentityFields({
  name,
  onNameChange,
  image,
  canEditImage,
  onPickImage,
  onClearImage,
  check,
  onUseSuggestion,
  onSubmit,
  isDisabled = false,
  hint,
}: {
  name: string;
  onNameChange: (value: string) => void;
  image: string;
  canEditImage: boolean;
  onPickImage: () => void;
  onClearImage: () => void;
  check: InstanceNameCheck;
  onUseSuggestion: (value: string) => void;
  onSubmit: () => void;
  isDisabled?: boolean;
  hint?: string;
}) {
  const { t } = useTranslation();
  const cover = resolveLocalImage(image);
  const showIssue = check.issue !== null && check.issue !== "empty";
  const message = showIssue ? instanceNameMessage(check, t) : hint;

  return (
    <div className="flex shrink-0 items-start gap-3">
      {cover ? (
        <div className="group/logo relative size-16 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-2">
          <img
            src={cover}
            alt=""
            draggable={false}
            className="size-full object-cover"
          />
          {canEditImage && (
            <div className="absolute inset-0 flex items-center justify-center gap-1 bg-background/75 opacity-0 transition-opacity group-hover/logo:opacity-100 focus-within:opacity-100">
              <button
                type="button"
                disabled={isDisabled}
                aria-label={t("common.editingLogo")}
                onClick={onPickImage}
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
              >
                <ImagePlus className="size-4" />
              </button>
              <button
                type="button"
                disabled={isDisabled}
                aria-label={t("common.delete")}
                onClick={onClearImage}
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          )}
        </div>
      ) : canEditImage ? (
        <Hint content={t("newInstance.logoHint")}>
          <button
            type="button"
            disabled={isDisabled}
            aria-label={t("common.editingLogo")}
            onClick={onPickImage}
            className="flex size-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-surface-1 text-faint transition-colors hover:border-input hover:bg-surface-2 hover:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ImagePlus className="size-5" />
            <span className="text-[0.6rem]">{t("common.logo")}</span>
          </button>
        </Hint>
      ) : (
        <Hint content={t("common.logo")}>
          <div className="flex size-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-border bg-surface-1 text-faint">
            <ImageOff className="size-5" />
          </div>
        </Hint>
      )}

      <div className="grid min-w-0 flex-1 gap-1.5">
        <div className="flex h-4 items-center gap-2">
          <Label htmlFor="new-instance-name" className="text-xs">
            {t("versions.name")}
          </Label>
          <span
            className={cn(
              "ml-auto font-mono text-[0.65rem] tabular-nums",
              name.trim().length > INSTANCE_NAME_MAX
                ? "text-destructive"
                : "text-faint",
            )}
          >
            {name.trim().length}/{INSTANCE_NAME_MAX}
          </span>
        </div>

        <Input
          id="new-instance-name"
          value={name}
          disabled={isDisabled}
          aria-invalid={showIssue}
          spellCheck={false}
          autoComplete="off"
          placeholder={t("versions.namePlaceholder")}
          onChange={(event) => onNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            onSubmit();
          }}
        />

        {(message || (showIssue && check.suggestion)) && (
          <div className="flex h-5 items-center gap-2">
            {message && (
              <Hint content={message} variant="text" truncatedOnly>
                <span
                  className={cn(
                    "min-w-0 truncate text-xs",
                    showIssue ? "text-destructive" : "text-faint",
                  )}
                >
                  {message}
                </span>
              </Hint>
            )}
            {showIssue && check.suggestion && (
              <button
                type="button"
                className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-primary transition-colors hover:bg-primary-soft"
                onClick={() => onUseSuggestion(check.suggestion)}
              >
                <Wand2 className="size-3" />
                {check.suggestion}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
