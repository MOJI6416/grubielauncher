import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import {
  ConfigLanguage,
  TOKEN_CLASS,
  Token,
  tokenizeConfig,
} from "./highlight";
import {
  Completion,
  CompletionResult,
  completionPatch,
  completionsFor,
} from "./complete";
import {
  EditPatch,
  applyPatch,
  autoPairPatch,
  newlinePatch,
  pairBackspacePatch,
} from "./editing";
import { findRanges } from "./contentSearch";
import { Highlight, buildLines, lineOfOffset, lineStartOffsets } from "./lines";

const LINE_HEIGHT = 20;
const POPUP_WIDTH = 232;
const POPUP_ITEM_HEIGHT = 24;
const POPUP_PADDING = 8;
const TEXT_GAP_PX = 12;

const KIND_MARK: Record<Completion["kind"], string> = {
  literal: "text-warning",
  key: "text-foreground",
  keyword: "text-primary",
};

const TONE_CLASS = {
  match: "rounded-[2px] bg-warning/25",
  active: "rounded-[2px] bg-warning/60 text-foreground",
} as const;

export interface ConfigTextEditorHandle {
  revealLine: (line: number, column?: number, length?: number) => void;
  openFind: (seed?: string) => void;
  focus: () => void;
}

export function ConfigTextEditor({
  ref,
  content,
  language,
  disabled,
  displayTokens,
  issueLine,
  onChange,
  onCaretChange,
}: {
  ref?: Ref<ConfigTextEditorHandle>;
  content: string;
  language: ConfigLanguage;
  disabled?: boolean;
  displayTokens?: Token[];
  issueLine: number | null;
  onChange: (value: string) => void;
  onCaretChange?: (offset: number) => void;
}) {
  const { t } = useTranslation();
  const [caret, setCaret] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [suggestion, setSuggestion] = useState<CompletionResult | null>(null);
  const [activeItem, setActiveItem] = useState(0);
  const [popupAt, setPopupAt] = useState<{ x: number; y: number } | null>(null);
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findIndex, setFindIndex] = useState(0);

  const highlightRef = useRef<HTMLPreElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const caretMarkRef = useRef<HTMLSpanElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const pendingSelectionRef = useRef<[number, number] | null>(null);
  const isPatchingRef = useRef(false);

  const isReadOnly = displayTokens !== undefined;
  const tokens = displayTokens ?? tokenizeConfig(content, language);
  const displayText = isReadOnly
    ? displayTokens.map((token) => token.text).join("")
    : content;
  const ranges = isFindOpen ? findRanges(displayText, findQuery) : [];
  const activeRange = ranges.length
    ? Math.min(findIndex, ranges.length - 1)
    : -1;
  const highlights: Highlight[] = ranges.map((range, index) => ({
    ...range,
    tone: index === activeRange ? "active" : "match",
  }));
  const lines = buildLines(tokens, highlights, isReadOnly ? null : caret);
  const starts = lineStartOffsets(displayText);
  const caretLine = lineOfOffset(starts, caret);
  const gutterChars = Math.max(2, String(lines.length).length);
  const gutterWidth = `calc(${gutterChars}ch + 16px)`;
  const textInset = `calc(${gutterChars}ch + ${16 + TEXT_GAP_PX}px)`;

  const updateCaret = (offset: number) => {
    setCaret(offset);
    onCaretChange?.(offset);
  };

  const scrollToElement = (element: HTMLElement | null) => {
    if (!element) return;
    const scroller = isReadOnly ? highlightRef.current : editorRef.current;
    if (!scroller) return;

    let top = 0;
    for (
      let node: HTMLElement | null = element;
      node && node !== highlightRef.current;
      node = node.offsetParent as HTMLElement | null
    ) {
      top += node.offsetTop;
    }

    const visibleTop = scroller.scrollTop;
    const visibleBottom = visibleTop + scroller.clientHeight;
    if (
      top >= visibleTop + LINE_HEIGHT &&
      top <= visibleBottom - LINE_HEIGHT * 2
    ) {
      return;
    }

    scroller.scrollTop = Math.max(0, top - scroller.clientHeight / 3);
    if (highlightRef.current && scroller !== highlightRef.current) {
      highlightRef.current.scrollTop = scroller.scrollTop;
    }
  };

  const selectRange = (from: number, to: number) => {
    const node = editorRef.current;
    if (!node || isReadOnly) return;
    node.focus();
    node.setSelectionRange(from, to);
    updateCaret(from);
  };

  useImperativeHandle(ref, () => ({
    revealLine: (line, column = 0, length = 0) => {
      const lineStart = starts[Math.min(line, starts.length - 1)] ?? 0;
      const from = Math.min(lineStart + column, displayText.length);
      selectRange(from, Math.min(from + length, displayText.length));
      requestAnimationFrame(() =>
        scrollToElement(
          highlightRef.current?.querySelector<HTMLElement>(
            `[data-line="${line}"]`,
          ) ?? null,
        ),
      );
    },
    openFind: (seed) => {
      const node = editorRef.current;
      const selected =
        node && node.selectionStart !== node.selectionEnd
          ? node.value.slice(node.selectionStart, node.selectionEnd)
          : "";
      const next =
        seed ?? (selected && !selected.includes("\n") ? selected : "");
      if (next) setFindQuery(next);
      setFindIndex(0);
      setIsFindOpen(true);
      requestAnimationFrame(() => {
        findInputRef.current?.focus();
        findInputRef.current?.select();
      });
    },
    focus: () => editorRef.current?.focus(),
  }));

  useEffect(() => {
    if (!isFindOpen || activeRange === -1) return;
    scrollToElement(
      highlightRef.current?.querySelector<HTMLElement>("[data-active]") ?? null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFindOpen, activeRange, findQuery]);

  const closeFind = () => {
    setIsFindOpen(false);
    const range = ranges[activeRange];
    if (range) selectRange(range.from, range.to);
    else editorRef.current?.focus();
  };

  const stepFind = (step: number) => {
    if (!ranges.length) return;
    setFindIndex((activeRange + step + ranges.length) % ranges.length);
  };

  const applyEdit = (patch: EditPatch) => {
    const node = editorRef.current;
    if (!node) return;

    const selectionEnd = patch.selectTo ?? patch.caret;
    isPatchingRef.current = true;

    node.focus();
    node.setSelectionRange(patch.from, patch.to);

    const inserted =
      (patch.insert !== "" || patch.from !== patch.to) &&
      document.execCommand("insertText", false, patch.insert);

    if (inserted) {
      node.setSelectionRange(patch.caret, selectionEnd);
    } else {
      onChange(applyPatch(content, patch));
      pendingSelectionRef.current = [patch.caret, selectionEnd];
    }

    isPatchingRef.current = false;
    updateCaret(patch.caret);
  };

  useLayoutEffect(() => {
    const selection = pendingSelectionRef.current;
    const node = editorRef.current;
    if (!selection || !node) return;

    pendingSelectionRef.current = null;
    node.setSelectionRange(selection[0], selection[1]);
  }, [content]);

  useLayoutEffect(() => {
    if (!suggestion) {
      setPopupAt(null);
      return;
    }

    const mark = caretMarkRef.current;
    const frame = frameRef.current;
    if (!mark || !frame) return;

    const markRect = mark.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const maxX = Math.max(0, frameRect.width - POPUP_WIDTH - 8);
    const height = suggestion.items.length * POPUP_ITEM_HEIGHT + POPUP_PADDING;
    const top = markRect.top - frameRect.top;
    const below = top + LINE_HEIGHT;
    const above = top - height;

    setPopupAt({
      x: Math.min(Math.max(0, markRect.left - frameRect.left), maxX),
      y:
        below + height <= frameRect.height || above < 0
          ? Math.min(below, Math.max(0, frameRect.height - height))
          : above,
    });
  }, [suggestion, content]);

  const accept = (item: Completion) => {
    if (!suggestion) return;
    setSuggestion(null);
    applyEdit(completionPatch(suggestion, item.label));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const node = event.currentTarget;
    const start = node.selectionStart;
    const end = node.selectionEnd;

    if (suggestion) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActiveItem(
          (prev) =>
            (prev + step + suggestion.items.length) % suggestion.items.length,
        );
        return;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        accept(suggestion.items[activeItem] ?? suggestion.items[0]);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setSuggestion(null);
        return;
      }
    }

    if (event.key === "Escape" && isFindOpen) {
      event.preventDefault();
      event.stopPropagation();
      setIsFindOpen(false);
      return;
    }

    if (disabled) return;

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      applyEdit(newlinePatch(content, start, end));
      return;
    }

    if (event.key === "Backspace") {
      const patch = pairBackspacePatch(content, start, end);
      if (!patch) return;
      event.preventDefault();
      applyEdit(patch);
      return;
    }

    if (
      event.key.length !== 1 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return;
    }

    const patch = autoPairPatch(content, start, end, event.key);
    if (!patch) return;

    event.preventDefault();
    setSuggestion(null);
    applyEdit(patch);
  };

  return (
    <div ref={frameRef} className="relative min-h-0 flex-1 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 border-r border-border/60 bg-surface-1/60 font-mono text-xs"
        style={{ width: gutterWidth }}
      />

      <pre
        aria-hidden={!isReadOnly}
        ref={highlightRef}
        tabIndex={isReadOnly ? 0 : undefined}
        className={cn(
          "absolute inset-0 [scrollbar-gutter:stable] py-3 pr-3 font-mono text-xs leading-5 whitespace-pre-wrap break-words",
          isReadOnly
            ? "overflow-y-auto select-text"
            : "pointer-events-none overflow-hidden select-none",
        )}
        style={{ paddingLeft: textInset }}
      >
        {lines.map((segments, index) => (
          <div
            key={index}
            data-line={index}
            className={cn(
              "relative min-h-5",
              index === issueLine
                ? "bg-destructive/12"
                : isFocused && !isReadOnly && index === caretLine
                  ? "bg-surface-2/50"
                  : undefined,
            )}
          >
            <span
              className={cn(
                "absolute top-0 pr-2 text-right tabular-nums select-none",
                index === issueLine
                  ? "text-destructive"
                  : isFocused && index === caretLine
                    ? "text-muted-foreground"
                    : "text-faint/70",
              )}
              style={{
                right: `calc(100% + ${TEXT_GAP_PX}px)`,
                width: gutterWidth,
              }}
            >
              {index + 1}
            </span>
            {segments.map((segment, position) =>
              segment.caret ? (
                <span key={position} ref={caretMarkRef} />
              ) : (
                <span
                  key={position}
                  data-active={segment.tone === "active" ? true : undefined}
                  className={cn(
                    TOKEN_CLASS[segment.kind],
                    segment.tone && TONE_CLASS[segment.tone],
                  )}
                >
                  {segment.text}
                </span>
              ),
            )}
          </div>
        ))}
      </pre>

      {!isReadOnly && (
        <textarea
          ref={editorRef}
          spellCheck={false}
          value={content}
          disabled={disabled}
          aria-label={t("configs.editorLabel")}
          onFocus={() => setIsFocused(true)}
          onScroll={(event) => {
            const node = highlightRef.current;
            if (!node) return;
            node.scrollTop = event.currentTarget.scrollTop;
            node.scrollLeft = event.currentTarget.scrollLeft;
            setSuggestion(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            setIsFocused(false);
            setSuggestion(null);
          }}
          onSelect={(event) => updateCaret(event.currentTarget.selectionStart)}
          onChange={(event) => {
            const value = event.target.value;
            const position = event.target.selectionStart ?? value.length;

            onChange(value);
            if (isPatchingRef.current) return;

            updateCaret(position);

            const result = completionsFor(value, position, language);
            setActiveItem(0);
            setSuggestion(result.items.length ? result : null);
          }}
          className="absolute inset-0 size-full resize-none bg-transparent [scrollbar-gutter:stable] py-3 pr-3 font-mono text-xs leading-5 whitespace-pre-wrap break-words text-transparent caret-foreground outline-none disabled:opacity-60"
          style={{ paddingLeft: textInset }}
        />
      )}

      {isFindOpen && (
        <div className="absolute top-2 right-3 z-20 flex items-center gap-1 rounded-lg border border-border bg-popover p-1 shadow-lg">
          <Input
            ref={findInputRef}
            value={findQuery}
            placeholder={t("configs.findPlaceholder")}
            aria-label={t("configs.findPlaceholder")}
            className="h-7 w-48 text-xs"
            onChange={(event) => {
              setFindQuery(event.target.value);
              setFindIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                stepFind(event.shiftKey ? -1 : 1);
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeFind();
              }
            }}
          />
          <span
            className={cn(
              "min-w-14 px-1 text-center font-mono text-[0.65rem] tabular-nums",
              findQuery && !ranges.length ? "text-destructive" : "text-faint",
            )}
          >
            {findQuery
              ? ranges.length
                ? `${activeRange + 1}/${ranges.length}`
                : t("configs.findNone")
              : ""}
          </span>
          <Hint content={t("configs.findPrevious")}>
            <Button
              size="icon-sm"
              variant="ghost"
              className="size-7"
              disabled={!ranges.length}
              aria-label={t("configs.findPrevious")}
              onClick={() => stepFind(-1)}
            >
              <ChevronUp className="size-3.5" />
            </Button>
          </Hint>
          <Hint content={t("configs.findNext")}>
            <Button
              size="icon-sm"
              variant="ghost"
              className="size-7"
              disabled={!ranges.length}
              aria-label={t("configs.findNext")}
              onClick={() => stepFind(1)}
            >
              <ChevronDown className="size-3.5" />
            </Button>
          </Hint>
          <Hint content={t("common.close")}>
            <Button
              size="icon-sm"
              variant="ghost"
              className="size-7"
              aria-label={t("common.close")}
              onClick={closeFind}
            >
              <X className="size-3.5" />
            </Button>
          </Hint>
        </div>
      )}

      {suggestion && popupAt && (
        <div
          style={{ left: popupAt.x, top: popupAt.y, width: POPUP_WIDTH }}
          className="absolute z-10 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-lg"
        >
          {suggestion.items.map((item, index) => (
            <button
              key={item.label}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                accept(item);
              }}
              onMouseEnter={() => setActiveItem(index)}
              className={cn(
                "flex h-6 w-full items-center gap-2 px-2 text-left font-mono text-[0.7rem]",
                index === activeItem && "bg-surface-3",
              )}
            >
              <span
                className={cn("min-w-0 flex-1 truncate", KIND_MARK[item.kind])}
              >
                {item.label}
              </span>
              <span className="shrink-0 text-[0.6rem] text-faint">
                {t(`configs.completion.${item.kind}`)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
