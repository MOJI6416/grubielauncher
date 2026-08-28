import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Copy, Terminal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@renderer/utilities/clipboard";

const LEVEL_CLASS: { pattern: RegExp; className: string }[] = [
  {
    pattern: /\b(ERROR|FATAL|Exception|Caused by)\b/,
    className: "text-destructive",
  },
  { pattern: /\bWARN(ING)?\b/, className: "text-warning" },
  { pattern: /^>/, className: "text-primary" },
  { pattern: /^\[launcher\]/, className: "text-faint" },
];

function lineClass(line: string) {
  return (
    LEVEL_CLASS.find((entry) => entry.pattern.test(line))?.className ??
    "text-muted-foreground"
  );
}

export function ServerConsole({
  lines,
  canSend,
  onSend,
}: {
  lines: string[];
  canSend: boolean;
  onSend: (command: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  const send = async () => {
    const command = value.trim();
    if (!command || !canSend) return;

    setValue("");
    setCursor(null);
    setHistory((prev) =>
      [command, ...prev.filter((e) => e !== command)].slice(0, 30),
    );

    await onSend(command);
  };

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <Terminal className="size-3.5 text-faint" />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {t("serverManager.console")}
        </p>
        <span className="font-mono text-[0.7rem] text-faint tabular-nums">
          {lines.length}
        </span>
        <Hint content={t("serverManager.copyLog")}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7"
            disabled={!lines.length}
            aria-label={t("serverManager.copyLog")}
            onClick={async () => {
              if (!(await copyToClipboard(lines.join("\n")))) return;
              toast.success(t("common.copied"));
            }}
          >
            <Copy className="size-3.5" />
          </Button>
        </Hint>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {lines.length ? (
          <div className="font-mono text-[11px] leading-4">
            {lines.map((line, index) => (
              <p
                key={index}
                className={cn("break-all whitespace-pre-wrap", lineClass(line))}
              >
                {line}
              </p>
            ))}
            <div ref={endRef} />
          </div>
        ) : (
          <p className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
            {t("serverManager.consoleEmpty")}
          </p>
        )}
      </div>

      <form
        className="flex shrink-0 items-center gap-2 border-t bg-surface-1 px-3 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <ChevronRight className="size-3.5 shrink-0 text-faint" />
        <Input
          value={value}
          disabled={!canSend}
          spellCheck={false}
          placeholder={
            canSend
              ? t("serverManager.commandPlaceholder")
              : t("serverManager.commandDisabled")
          }
          className="h-8 border-0 bg-transparent px-0 font-mono text-xs shadow-none focus-visible:ring-0"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            if (!history.length) return;

            event.preventDefault();
            const step = event.key === "ArrowUp" ? 1 : -1;
            const next = (cursor === null ? -1 : cursor) + step;

            if (next < 0) {
              setCursor(null);
              setValue("");
              return;
            }

            const index = Math.min(history.length - 1, next);
            setCursor(index);
            setValue(history[index]);
          }}
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          className="h-8"
          disabled={!canSend || !value.trim()}
        >
          {t("serverManager.commandSend")}
        </Button>
      </form>
    </section>
  );
}
