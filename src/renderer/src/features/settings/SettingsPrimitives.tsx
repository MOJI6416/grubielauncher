import { Children, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Hint } from "@renderer/components/Hint";
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

export function SettingsGroup({
  title,
  hint,
  children,
  className,
}: {
  title?: ReactNode;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  if (Children.toArray(children).length === 0) return null;

  return (
    <section className={cn("min-w-0", className)}>
      {title && (
        <div className="mb-1.5 flex items-baseline gap-2 px-0.5">
          <h3 className="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
            {title}
          </h3>
          {hint && <span className="truncate text-xs text-faint">{hint}</span>}
        </div>
      )}
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
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
  children?: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "group/row px-3.5 py-2.5 transition-colors",
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
                  className="size-1.5 shrink-0 rounded-full bg-primary"
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
        </div>
        {control && <div className="shrink-0">{control}</div>}
      </div>
      {children && <div className="mt-2.5">{children}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors",
            value === option.value
              ? "bg-surface-3 text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
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

  return (
    <Hint content={path || undefined} variant="text" wrapperClassName="w-full">
      <button
        type="button"
        onClick={onOpen}
        disabled={!path}
        className="flex w-full items-center gap-3 px-3.5 py-2 text-left transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="w-24 shrink-0 text-sm text-foreground">{label}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-faint">
          {path || "—"}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {t("settings.folders.open")}
        </span>
      </button>
    </Hint>
  );
}
