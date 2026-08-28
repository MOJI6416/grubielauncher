import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import {
  RESERVED_TAGS,
  canAddTag,
  filterSuggestions,
  normalizeTag,
} from "./tags";

const api = window.api;

export function TagsInput({
  value,
  onChange,
  max = 8,
  disabled,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  max?: number;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedTagsKey = value.join(" ");
  const canAdd = value.length < max;
  const typed = normalizeTag(input);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setActive(-1);
    const selectedTags = selectedTagsKey.split(" ");
    const id = setTimeout(async () => {
      try {
        const data = await api.skins.tags.suggest(input.trim());
        if (cancelled) return;
        setSuggestions(filterSuggestions(data, selectedTags, 8));
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [input, selectedTagsKey, open]);

  const addTag = (raw: string) => {
    if (!canAddTag(raw, value, max)) return;
    const tag = normalizeTag(raw);
    onChange([...value, tag]);
    setInput("");
    setActive(-1);
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((entry) => entry !== tag));
    inputRef.current?.focus();
  };

  const showPopover = open && canAdd && !disabled;

  const note = RESERVED_TAGS.has(typed)
    ? t("tagsInput.reserved")
    : typed && value.includes(typed)
      ? t("tagsInput.alreadyAdded")
      : t("tagsInput.noSuggestions");

  return (
    <div className="grid gap-1.5">
      <Popover
        open={showPopover && (loading || suggestions.length > 0 || !!typed)}
      >
        <PopoverAnchor asChild>
          <div
            className={cn(
              "flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-border bg-surface-2 p-1.5 transition-colors focus-within:border-ring",
              disabled && "opacity-60",
            )}
            onMouseDown={(event) => {
              if (event.target !== inputRef.current) event.preventDefault();
            }}
            onClick={() => inputRef.current?.focus()}
          >
            {value.map((tag) => (
              <span
                key={tag}
                className="flex h-6 items-center gap-1 rounded-full border border-border bg-surface-3 pr-1 pl-2 text-xs text-foreground"
              >
                <span>
                  <span className="text-faint">#</span>
                  {tag}
                </span>
                <Hint content={t("tagsInput.remove")}>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={t("tagsInput.remove")}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => removeTag(tag)}
                    className="grid size-4 place-items-center rounded-full text-faint transition-colors outline-none hover:bg-surface-1 hover:text-foreground focus-visible:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </Hint>
              </span>
            ))}

            {canAdd && (
              <input
                ref={inputRef}
                value={input}
                disabled={disabled}
                onChange={(event) => {
                  setInput(event.target.value);
                  setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" && suggestions.length > 0) {
                    event.preventDefault();
                    setActive((index) => (index + 1) % suggestions.length);
                  } else if (
                    event.key === "ArrowUp" &&
                    suggestions.length > 0
                  ) {
                    event.preventDefault();
                    setActive((index) =>
                      index <= 0 ? suggestions.length - 1 : index - 1,
                    );
                  } else if (event.key === "Escape" && open) {
                    event.preventDefault();
                    setOpen(false);
                  } else if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault();
                    addTag(active >= 0 ? suggestions[active] : input);
                  } else if (
                    event.key === "Backspace" &&
                    !input &&
                    value.length > 0
                  ) {
                    removeTag(value[value.length - 1]);
                  }
                }}
                placeholder={
                  value.length === 0 ? t("tagsInput.placeholder") : ""
                }
                className="h-6 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-faint"
              />
            )}
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="w-(--radix-popover-trigger-width) p-1.5"
        >
          {loading ? (
            <div className="flex flex-wrap gap-1">
              {[64, 88, 72].map((width) => (
                <Skeleton
                  key={width}
                  className="h-6 rounded-full bg-surface-1"
                  style={{ width }}
                />
              ))}
            </div>
          ) : suggestions.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {suggestions.map((entry, index) => (
                <button
                  key={entry}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    addTag(entry);
                  }}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    "h-6 rounded-full border px-2 text-xs transition-colors outline-none",
                    index === active
                      ? "border-primary/45 bg-primary-soft-raised text-foreground"
                      : "border-border text-muted-foreground hover:bg-surface-2",
                  )}
                >
                  <span className="text-faint">#</span>
                  {entry}
                </button>
              ))}
            </div>
          ) : (
            <p className="px-1 py-0.5 text-xs text-faint">{note}</p>
          )}
        </PopoverContent>
      </Popover>

      <div className="flex items-center justify-between gap-2 text-[0.7rem]">
        <span className={cn(canAdd ? "text-faint" : "text-warning")}>
          {canAdd ? t("tagsInput.hint") : t("tagsInput.limitReached")}
        </span>
        <span className="font-mono tabular-nums text-faint">
          {value.length}/{max}
        </span>
      </div>
    </div>
  );
}
