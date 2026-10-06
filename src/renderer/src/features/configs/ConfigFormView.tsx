import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CodeXml, RotateCcw, Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Hint } from "@renderer/components/Hint";
import {
  ConfigDocument,
  ConfigField,
  descriptionLines,
  fieldHints,
  humanizeKey,
  parseDefault,
  positionAt,
  stripHintBrackets,
  writeField,
} from "./document";

type FieldWrite = (
  field: ConfigField,
  value: boolean | number | string,
) => void;

interface FieldView {
  field: ConfigField;
  label: string;
  description: string[];
  min?: number;
  max?: number;
  allowed?: string[];
  defaultValue: boolean | number | string | null;
  defaultLabel?: string;
}

function sameValue(
  field: ConfigField,
  value: boolean | number | string | null,
): boolean {
  if (value === null) return true;
  if (field.kind === "string" && typeof value === "string") {
    return String(field.value) === value;
  }
  return field.value === value;
}

function NumberControl({
  view,
  disabled,
  onWrite,
}: {
  view: FieldView;
  disabled?: boolean;
  onWrite: FieldWrite;
}) {
  const { field, min, max } = view;
  const [draft, setDraft] = useState<{ id: string; text: string } | null>(null);
  const text = draft?.id === field.id ? draft.text : String(field.value);
  const parsed = Number(text.replace(",", "."));
  const isValid =
    text.trim() !== "" &&
    Number.isFinite(parsed) &&
    (field.numberStyle !== "integer" || Number.isInteger(parsed)) &&
    (min === undefined || parsed >= min) &&
    (max === undefined || parsed <= max);

  return (
    <Input
      value={text}
      inputMode={field.numberStyle === "integer" ? "numeric" : "decimal"}
      disabled={disabled}
      aria-invalid={!isValid || undefined}
      aria-label={view.label}
      className="h-8 w-32 font-mono text-xs tabular-nums"
      onChange={(event) => {
        const next = event.target.value;
        setDraft({ id: field.id, text: next });
        const value = Number(next.replace(",", "."));
        const fits =
          next.trim() !== "" &&
          Number.isFinite(value) &&
          (field.numberStyle !== "integer" || Number.isInteger(value)) &&
          (min === undefined || value >= min) &&
          (max === undefined || value <= max);
        if (fits && value !== field.value) onWrite(field, value);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

function FieldControl({
  view,
  disabled,
  onWrite,
  onReveal,
}: {
  view: FieldView;
  disabled?: boolean;
  onWrite: FieldWrite;
  onReveal: () => void;
}) {
  const { t } = useTranslation();
  const { field } = view;

  if (field.kind === "boolean") {
    return (
      <Switch
        checked={field.value === true}
        disabled={disabled}
        aria-label={view.label}
        onCheckedChange={(checked) => onWrite(field, checked)}
      />
    );
  }

  if (field.kind === "number") {
    return <NumberControl view={view} disabled={disabled} onWrite={onWrite} />;
  }

  if (field.kind === "string" && view.allowed) {
    const value = String(field.value);
    const options = view.allowed.includes(value)
      ? view.allowed
      : [value, ...view.allowed];

    return (
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => onWrite(field, next)}
      >
        <SelectTrigger size="sm" className="w-44" aria-label={view.label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.kind === "string") {
    return (
      <Input
        value={String(field.value)}
        disabled={disabled}
        aria-label={view.label}
        spellCheck={false}
        className="h-8 w-56 font-mono text-xs"
        onChange={(event) => onWrite(field, event.target.value)}
      />
    );
  }

  const items = Array.isArray(field.value) ? field.value : null;

  return (
    <div className="flex max-w-64 min-w-0 items-center gap-1.5">
      <Hint
        content={items ? items.join("\n") : field.raw}
        variant="text"
        className="max-w-96 font-mono text-[0.7rem] whitespace-pre-wrap"
      >
        <span className="min-w-0 truncate rounded-md bg-surface-2 px-2 py-1 font-mono text-[0.7rem] text-muted-foreground">
          {items
            ? items.length
              ? t("configs.form.items", { count: items.length })
              : t("configs.form.emptyList")
            : field.raw || "…"}
        </span>
      </Hint>
      <Hint content={t("configs.form.editInText")}>
        <Button
          size="icon-sm"
          variant="ghost"
          className="size-7 shrink-0"
          aria-label={t("configs.form.editInText")}
          onClick={onReveal}
        >
          <CodeXml className="size-3.5" />
        </Button>
      </Hint>
    </div>
  );
}

export function ConfigFormView({
  document,
  text,
  disabled,
  translations,
  onChange,
  onReveal,
}: {
  document: ConfigDocument;
  text: string;
  disabled?: boolean;
  translations: ReadonlyMap<string, string>;
  onChange: (next: string) => void;
  onReveal: (line: number) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const views: FieldView[] = document.fields.map((field) => {
    const hints = fieldHints(field.comments);
    const parsedDefault =
      hints.defaultValue !== undefined
        ? parseDefault(field, hints.defaultValue)
        : null;

    return {
      field,
      label: humanizeKey(field.key),
      description: descriptionLines(field.comments).map((line) => {
        const translated = translations.get(line.source);
        return translated ? stripHintBrackets(translated) : line.text;
      }),
      min: field.kind === "number" ? hints.min : undefined,
      max: field.kind === "number" ? hints.max : undefined,
      allowed: field.kind === "string" ? hints.allowed : undefined,
      defaultValue: parsedDefault,
      defaultLabel: hints.defaultValue,
    };
  });

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? views.filter((view) =>
        [
          view.field.key,
          view.label,
          ...view.description,
          view.field.section.join("."),
        ]
          .join("\n")
          .toLowerCase()
          .includes(needle),
      )
    : views;

  const sections: {
    key: string;
    path: string;
    title: string;
    views: FieldView[];
  }[] = [];
  for (const view of visible) {
    const path = view.field.section.join("\u0000");
    const last = sections[sections.length - 1];
    if (last && last.path === path) last.views.push(view);
    else {
      sections.push({
        key: `${path}\u0001${sections.length}`,
        path,
        title: view.field.section.join(" › "),
        views: [view],
      });
    }
  }

  const write: FieldWrite = (field, value) =>
    onChange(writeField(text, document.format, field, value));

  const reveal = (field: ConfigField) =>
    onReveal(positionAt(text, field.from).line);

  if (document.fields.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          {t("configs.form.empty")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            placeholder={t("configs.form.search")}
            aria-label={t("configs.form.search")}
            className="h-8 pl-8 text-xs"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.preventDefault();
                event.stopPropagation();
                setQuery("");
              }
            }}
          />
        </div>
        <span className="shrink-0 font-mono text-[0.65rem] tabular-nums text-faint">
          {needle
            ? `${visible.length}/${views.length}`
            : t("configs.form.count", { count: views.length })}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <SearchX className="size-5 text-faint" />
            <p className="text-xs text-muted-foreground">
              {t("configs.form.notFound")}
            </p>
          </div>
        ) : (
          sections.map((section) => (
            <section key={section.key} className="flex flex-col">
              {section.title && (
                <header className="sticky top-0 z-10 flex h-8 shrink-0 items-center border-b border-border/60 bg-card px-3">
                  <span className="truncate font-mono text-[0.68rem] font-semibold tracking-wide text-faint">
                    {section.title}
                  </span>
                </header>
              )}

              {section.views.map((view) => {
                const isDefault =
                  view.defaultValue === null ||
                  sameValue(view.field, view.defaultValue);

                return (
                  <div
                    key={view.field.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 border-b border-border/40 px-3 py-2.5 last:border-b-0"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="min-w-0 truncate text-xs font-medium text-foreground">
                          {view.label}
                        </span>
                        {view.label !== view.field.key && (
                          <Hint
                            content={view.field.key}
                            variant="text"
                            truncatedOnly
                          >
                            <span className="min-w-0 truncate font-mono text-[0.65rem] text-faint">
                              {view.field.key}
                            </span>
                          </Hint>
                        )}
                      </span>

                      {view.description.map((line, index) => (
                        <p
                          key={index}
                          className="text-[0.7rem] leading-4 [overflow-wrap:anywhere] text-muted-foreground"
                        >
                          {line}
                        </p>
                      ))}

                      {(view.min !== undefined ||
                        view.max !== undefined ||
                        view.defaultLabel !== undefined) && (
                        <p className="flex flex-wrap gap-x-3 font-mono text-[0.65rem] text-faint">
                          {(view.min !== undefined ||
                            view.max !== undefined) && (
                            <span>
                              {t("configs.form.range", {
                                min: view.min ?? "−∞",
                                max: view.max ?? "∞",
                              })}
                            </span>
                          )}
                          {view.defaultLabel !== undefined && (
                            <span>
                              {t("configs.form.default", {
                                value: view.defaultLabel,
                              })}
                            </span>
                          )}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 pt-0.5">
                      {!isDefault && view.defaultValue !== null && (
                        <Hint content={t("configs.form.resetField")}>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="size-7 text-faint"
                            disabled={disabled}
                            aria-label={t("configs.form.resetField")}
                            onClick={() =>
                              write(
                                view.field,
                                view.defaultValue as boolean | number | string,
                              )
                            }
                          >
                            <RotateCcw className="size-3.5" />
                          </Button>
                        </Hint>
                      )}
                      <FieldControl
                        view={view}
                        disabled={disabled}
                        onWrite={write}
                        onReveal={() => reveal(view.field)}
                      />
                    </div>
                  </div>
                );
              })}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
