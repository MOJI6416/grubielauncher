import { Children, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Lock, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Hint } from "@renderer/components/Hint";
import { useRedact } from "@renderer/features/streamer/streamerMode";
import { highlightParts } from "./search";

export function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;

  return (
    <>
      {highlightParts(text, query).map((part, index) =>
        part.hit ? (
          <mark
            key={index}
            className="rounded-[2px] bg-primary-soft text-foreground"
          >
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

export function LockedNote({
  reason,
  className,
}: {
  reason: string;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-xs leading-snug text-muted-foreground",
        className,
      )}
    >
      <Lock className="mt-px size-3 shrink-0 text-faint" />
      <span className="min-w-0">{reason}</span>
    </p>
  );
}

export function SettingsGroup({
  title,
  hint,
  entry,
  lockedReason,
  children,
  className,
}: {
  title?: ReactNode;
  hint?: string;
  entry?: string;
  lockedReason?: string;
  children: ReactNode;
  className?: string;
}) {
  if (Children.toArray(children).length === 0) return null;

  return (
    <section
      data-settings-entry={entry}
      className={cn(
        "min-w-0 scroll-my-3 data-[flash]:[&>.settings-card]:ring-2 data-[flash]:[&>.settings-card]:ring-primary/50",
        className,
      )}
    >
      {title && (
        <div className="mb-1.5 flex items-baseline gap-2 px-0.5">
          <h3 className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
            {title}
          </h3>
          {hint && (
            <Hint content={hint} variant="text" truncatedOnly>
              <span className="truncate text-xs text-faint">{hint}</span>
            </Hint>
          )}
        </div>
      )}
      {lockedReason && (
        <LockedNote reason={lockedReason} className="mb-1.5 px-0.5" />
      )}
      <div
        inert={Boolean(lockedReason)}
        className={cn(
          "settings-card divide-y divide-border overflow-hidden rounded-xl border border-border bg-card transition-shadow",
          lockedReason && "opacity-60",
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function SettingRow({
  title,
  description,
  htmlFor,
  control,
  changed,
  onReset,
  query = "",
  disabled,
  entry,
  lockedReason,
  children,
}: {
  title: string;
  description?: string;
  htmlFor?: string;
  control?: ReactNode;
  changed?: boolean;
  onReset?: () => void;
  query?: string;
  disabled?: boolean;
  entry?: string;
  lockedReason?: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const locked = Boolean(lockedReason);

  return (
    <div
      data-settings-entry={entry}
      className={cn(
        "group/row scroll-my-3 px-3.5 py-2.5 transition-colors data-[flash]:bg-primary-soft",
        disabled && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {changed && (
              <Hint content={t("settings.changed")}>
                <span
                  aria-label={t("settings.changed")}
                  className="size-1.5 shrink-0 rounded-full bg-info"
                />
              </Hint>
            )}
            <Label
              htmlFor={htmlFor}
              className="min-w-0 text-sm font-medium text-foreground"
            >
              <span className="min-w-0">
                <Highlighted text={title} query={query} />
              </span>
            </Label>
            {changed && onReset && (
              <Hint content={t("settings.resetOne")}>
                <button
                  type="button"
                  onClick={onReset}
                  aria-label={t("settings.resetOne")}
                  className="flex size-5 shrink-0 items-center justify-center rounded-md text-faint opacity-0 transition-opacity group-hover/row:opacity-100 hover:text-foreground focus-visible:opacity-100"
                >
                  <RotateCcw className="size-3" />
                </button>
              </Hint>
            )}
          </div>
          {description && (
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
              <Highlighted text={description} query={query} />
            </p>
          )}
          {lockedReason && (
            <LockedNote reason={lockedReason} className="mt-1" />
          )}
        </div>
        {control && (
          <div inert={locked} className={cn("shrink-0", locked && "opacity-50")}>
            {control}
          </div>
        )}
      </div>
      {children && (
        <div inert={locked} className={cn("mt-2.5", locked && "opacity-50")}>
          {children}
        </div>
      )}
    </div>
  );
}

export function PathRow({
  label,
  path,
  onOpen,
}: {
  label: string;
  path: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const redact = useRedact();
  const shown = redact.path(path);

  return (
    <Hint content={shown || undefined} variant="text" wrapperClassName="w-full">
      <button
        type="button"
        onClick={onOpen}
        disabled={!path}
        className="flex w-full items-center gap-3 px-3.5 py-2 text-left transition-colors hover:bg-row-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="w-24 shrink-0 text-sm text-foreground">{label}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-faint">
          {shown || "—"}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {t("settings.folders.open")}
        </span>
      </button>
    </Hint>
  );
}
