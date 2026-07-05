import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";

const api = window.api;

function normalizeTag(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
}

export function TagsInput({
  value,
  onChange,
  max = 8,
  placeholder,
  disabled,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const data = await api.skins.tags.suggest(input.trim());
        if (cancelled) return;
        setSuggestions(
          data.filter((entry) => !value.includes(entry)).slice(0, 8),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [input, value, open]);

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw);
    if (!tag || value.includes(tag) || value.length >= max) return;
    onChange([...value, tag]);
    setInput("");
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((entry) => entry !== tag));
    inputRef.current?.focus();
  };

  const canAdd = value.length < max;

  return (
    <div className="grid gap-1.5">
      <div
        className="flex flex-wrap items-center gap-1 rounded-lg border bg-card p-1.5"
        onMouseDown={(event) => {
          if (event.target !== inputRef.current) event.preventDefault();
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
          >
            #{tag}
            <button
              type="button"
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => removeTag(tag)}
              className="text-primary/70 transition-colors hover:text-primary"
            >
              <X className="size-3" />
            </button>
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
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addTag(input);
              } else if (
                event.key === "Backspace" &&
                !input &&
                value.length > 0
              ) {
                removeTag(value[value.length - 1]);
              }
            }}
            placeholder={value.length === 0 ? placeholder : ""}
            className="min-w-[6rem] flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
          />
        )}
      </div>

      {open && canAdd && (
        <div className="flex h-7 items-center gap-1 overflow-x-auto">
          {loading ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            suggestions.map((entry) => (
              <button
                key={entry}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  addTag(entry);
                }}
                className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent"
              >
                #{entry}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
