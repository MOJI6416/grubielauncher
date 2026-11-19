import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, FileUp, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TITLEBAR_HEIGHT } from "@/shared/titlebar";
import { parseArchiveUrl } from "./archiveSource";

export function ArchiveSourceForm({
  initialUrl = "",
  disabled,
  offline,
  onPickFile,
  onSubmitUrl,
}: {
  initialUrl?: string;
  disabled?: boolean;
  offline?: boolean;
  onPickFile: () => void;
  onSubmitUrl: (url: string) => void;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState(initialUrl);
  const parsed = parseArchiveUrl(url);
  const invalid = url.trim() !== "" && !parsed;

  const urlBlocked = disabled || offline;

  const submit = () => {
    if (parsed && !urlBlocked) onSubmitUrl(parsed);
  };

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="justify-start"
        disabled={disabled}
        onClick={onPickFile}
      >
        <FileUp />
        {t("modpack.archive.pickFile")}
      </Button>

      <div className="flex items-center gap-2 text-3xs tracking-[0.08em] text-faint uppercase">
        <span className="h-px flex-1 bg-border" />
        {t("modpack.archive.orUrl")}
        <span className="h-px flex-1 bg-border" />
      </div>

      <form
        className="flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Link2 className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://…"
            aria-label={t("modpack.archive.url")}
            aria-invalid={invalid || undefined}
            disabled={urlBlocked}
            spellCheck={false}
            className="h-8 pl-8 font-mono text-xs"
          />
        </div>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={urlBlocked || !parsed}
        >
          <Download />
          {t("modpack.archive.download")}
        </Button>
      </form>

      <p className="text-2xs leading-snug text-faint">
        {invalid
          ? t("modpack.archive.badUrl")
          : offline && !disabled
            ? t("modpack.archive.offline")
            : t("modpack.archive.urlHint")}
      </p>
    </div>
  );
}

export function ArchiveSourcePopover({
  disabled,
  initialUrl,
  onPickFile,
  onSubmitUrl,
}: {
  disabled?: boolean;
  initialUrl?: string;
  onPickFile: () => void;
  onSubmitUrl: (url: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto h-7 shrink-0 px-2 text-xs"
          disabled={disabled}
        >
          <FileUp />
          {t("modpack.fromFile")}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={{ top: TITLEBAR_HEIGHT + 8, right: 8, bottom: 8, left: 8 }}
        className="w-80 p-3"
      >
        <p className="mb-1 text-sm font-medium text-foreground">
          {t("modpack.archive.title")}
        </p>
        <p className="mb-2.5 text-xs leading-snug text-muted-foreground">
          {t("modpack.fromFileHint")}
        </p>
        <ArchiveSourceForm
          initialUrl={initialUrl}
          disabled={disabled}
          onPickFile={() => {
            setOpen(false);
            onPickFile();
          }}
          onSubmitUrl={(url) => {
            setOpen(false);
            onSubmitUrl(url);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
