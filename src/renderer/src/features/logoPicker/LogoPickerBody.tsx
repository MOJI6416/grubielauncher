import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { useReducedMotion } from "motion/react";
import {
  Dices,
  ImageUp,
  PaintBucket,
  SquareDashed,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { SlidingIndicator } from "@renderer/components/SlidingIndicator";
import { useSlidingIndicator } from "@renderer/utilities/useSlidingIndicator";
import { trackSpotlight } from "@renderer/utilities/spotlight";
import type { TexturePack } from "./gameTextures";
import {
  LOGO_CATEGORIES,
  LOGO_PRESETS,
  findPreset,
  resolveSubject,
  type LogoCategory,
  type LogoPreset,
} from "./logoCatalog";
import { LOGO_BACKDROPS } from "./logoRender";
import { useTexturePack } from "./texturePack";
import { renderLogoBlob, useBackdropSwatch, useLogoThumb } from "./logoImage";

const COLUMNS = 7;
const THUMB_SIZE = 88;
const PREVIEW_SIZE = 152;
const SWATCH_SIZE = 32;
const ROLL_DELAYS = [40, 45, 50, 55, 65, 80, 100, 125, 160];
const TILT_DEGREES = 16;

function randomOf<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function PresetTile({
  preset,
  pack,
  backdropId,
  label,
  isSelected,
  isCursor,
  onPick,
  onPeek,
  onFocus,
  register,
}: {
  preset: LogoPreset;
  pack: TexturePack | null;
  backdropId: string;
  label: string;
  isSelected: boolean;
  isCursor: boolean;
  onPick: () => void;
  onPeek: (active: boolean) => void;
  onFocus: () => void;
  register: (node: HTMLButtonElement | null) => void;
}) {
  const thumb = useLogoThumb(preset, pack, backdropId, THUMB_SIZE);

  return (
    <Hint content={label}>
      <button
        ref={register}
        type="button"
        aria-label={label}
        aria-pressed={isSelected}
        tabIndex={isCursor ? 0 : -1}
        onClick={onPick}
        onPointerEnter={() => onPeek(true)}
        onPointerLeave={() => onPeek(false)}
        onFocus={() => {
          onFocus();
          onPeek(true);
        }}
        onBlur={() => onPeek(false)}
        className="group/tile relative size-11 overflow-hidden rounded-lg bg-surface-2 transition-[background-color,box-shadow,transform] duration-(--dur-fast) hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-95 aria-pressed:ring-2 aria-pressed:ring-primary"
      >
        {thumb ? (
          <img
            src={thumb}
            alt=""
            draggable={false}
            className="size-full object-cover transition-transform duration-(--dur) ease-(--ease-swift) group-hover/tile:-translate-y-0.5 group-hover/tile:scale-110"
          />
        ) : (
          <span className="block size-full animate-pulse bg-surface-3" />
        )}
      </button>
    </Hint>
  );
}

function BackdropSwatch({
  backdropId,
  label,
  isActive,
  onPick,
  onPeek,
}: {
  backdropId: string;
  label: string;
  isActive: boolean;
  onPick: () => void;
  onPeek: (active: boolean) => void;
}) {
  const swatch = useBackdropSwatch(backdropId, SWATCH_SIZE);
  const isEmpty = backdropId === "none";

  return (
    <Hint content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={isActive}
        onClick={onPick}
        onPointerEnter={() => onPeek(true)}
        onPointerLeave={() => onPeek(false)}
        className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2 text-faint transition-[box-shadow,transform] duration-(--dur-fast) hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:ring-2 aria-pressed:ring-primary"
      >
        {isEmpty ? (
          <SquareDashed className="size-4" />
        ) : swatch ? (
          <img src={swatch} alt="" draggable={false} className="size-full" />
        ) : null}
      </button>
    </Hint>
  );
}

function Preview({
  preset,
  pack,
  backdropId,
  isRolling,
  canTilt,
  placeholder,
}: {
  preset: LogoPreset | null;
  pack: TexturePack | null;
  backdropId: string;
  isRolling: boolean;
  canTilt: boolean;
  placeholder: string;
}) {
  const thumb = useLogoThumb(preset, pack, backdropId, PREVIEW_SIZE);
  const cardRef = useRef<HTMLDivElement>(null);

  const tilt = (event: PointerEvent<HTMLDivElement>) => {
    trackSpotlight(event);
    const card = cardRef.current;
    if (!card || !canTilt) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    card.style.transform = `rotateX(${-y * TILT_DEGREES}deg) rotateY(${x * TILT_DEGREES}deg) scale(1.06)`;
  };

  const settle = () => {
    if (cardRef.current) cardRef.current.style.transform = "";
  };

  return (
    <div
      onPointerMove={tilt}
      onPointerLeave={settle}
      className="spotlight relative size-[76px] shrink-0 rounded-xl [perspective:320px]"
    >
      <div
        ref={cardRef}
        className={cn(
          "size-full overflow-hidden rounded-xl border border-border bg-surface-2 transition-transform duration-(--dur) ease-(--ease-swift)",
          isRolling && "scale-95",
        )}
      >
        {preset && thumb ? (
          <img
            key={isRolling ? undefined : `${preset.id}|${backdropId}`}
            src={thumb}
            alt=""
            draggable={false}
            className="size-full animate-in object-cover duration-(--dur) fade-in-0 zoom-in-90"
          />
        ) : (
          <span className="flex size-full items-center justify-center p-2 text-center text-[0.6rem] leading-tight text-faint">
            {placeholder}
          </span>
        )}
      </div>
    </div>
  );
}

export function LogoPickerBody({
  outputSize,
  hasImage,
  onApply,
  onPickFile,
  onRemove,
}: {
  outputSize: number;
  hasImage: boolean;
  onApply: (blob: Blob) => void;
  onPickFile: () => void;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion() === true;
  const categoryIndicator = useSlidingIndicator<HTMLDivElement>();
  const packState = useTexturePack();
  const isReady = packState.status === "ready";
  const pack = packState.status === "ready" ? packState.pack : null;

  const [category, setCategory] = useState<LogoCategory>("blocks");
  const [backdrop, setBackdrop] = useState("none");
  const [selected, setSelected] = useState<string | null>(null);
  const [peekPreset, setPeekPreset] = useState<string | null>(null);
  const [peekBackdrop, setPeekBackdrop] = useState<string | null>(null);
  const [rolling, setRolling] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);

  const tiles = useRef(new Map<string, HTMLButtonElement>());
  const rollTimer = useRef<number | null>(null);
  const applyToken = useRef(0);

  useEffect(
    () => () => {
      if (rollTimer.current !== null) window.clearTimeout(rollTimer.current);
    },
    [],
  );

  const available = isReady
    ? LOGO_PRESETS.filter((preset) => resolveSubject(preset, pack) !== null)
    : [];
  const inCategory = (entry: LogoCategory) =>
    available.filter((preset) => preset.category === entry);
  const presets = inCategory(category);
  const isRolling = rolling !== null;
  const shownBackdrop = isRolling ? backdrop : (peekBackdrop ?? backdrop);
  const shownPreset =
    findPreset(rolling ?? peekPreset ?? selected ?? "") ?? null;

  const apply = (preset: LogoPreset, backdropId: string) => {
    setSelected(preset.id);
    const token = ++applyToken.current;
    void renderLogoBlob(preset, pack, backdropId, outputSize).then((blob) => {
      if (token === applyToken.current) onApply(blob);
    });
  };

  const switchCategory = (next: LogoCategory) => {
    setCategory(next);
    setCursor(
      Math.max(
        0,
        inCategory(next).findIndex((preset) => preset.id === selected),
      ),
    );
  };

  const pickBackdrop = (next: string) => {
    setBackdrop(next);
    const current = findPreset(selected ?? "");
    if (current) apply(current, next);
  };

  const roll = () => {
    if (isRolling || available.length < 2) return;
    const pool = available.filter((preset) => preset.id !== selected);
    const target = randomOf(pool);
    const targetBackdrop = randomOf(LOGO_BACKDROPS).id;

    const land = () => {
      rollTimer.current = null;
      setRolling(null);
      setBackdrop(targetBackdrop);
      setCategory(target.category);
      setCursor(
        inCategory(target.category).findIndex(
          (preset) => preset.id === target.id,
        ),
      );
      apply(target, targetBackdrop);
      requestAnimationFrame(() =>
        tiles.current.get(target.id)?.scrollIntoView({
          block: "nearest",
          behavior: reducedMotion ? "auto" : "smooth",
        }),
      );
    };

    if (reducedMotion) {
      land();
      return;
    }

    setBackdrop(targetBackdrop);
    let step = 0;
    const tick = () => {
      if (step >= ROLL_DELAYS.length) {
        land();
        return;
      }
      setRolling(randomOf(pool).id);
      rollTimer.current = window.setTimeout(tick, ROLL_DELAYS[step++]);
    };
    tick();
  };

  const moveCursor = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -COLUMNS,
      ArrowDown: COLUMNS,
      Home: -presets.length,
      End: presets.length,
    };
    const delta = steps[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const next = Math.min(presets.length - 1, Math.max(0, cursor + delta));
    setCursor(next);
    tiles.current.get(presets[next].id)?.focus();
  };

  const presetName = (id: string) => t(`logoPicker.presets.${id}`);
  const backdropName = (id: string) => t(`logoPicker.backdrops.${id}`);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-border p-3">
        <Preview
          preset={shownPreset}
          pack={pack}
          backdropId={shownBackdrop}
          isRolling={isRolling}
          canTilt={!reducedMotion}
          placeholder={isReady && !pack ? "" : t("logoPicker.placeholder")}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-sm font-semibold">
            {shownPreset ? presetName(shownPreset.id) : t("logoPicker.title")}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {shownPreset
              ? `${t(`logoPicker.categories.${shownPreset.category}`)} · ${backdropName(shownBackdrop)}`
              : !isReady
                ? t("logoPicker.loading")
                : pack
                  ? t("logoPicker.source", { version: pack.id })
                  : t("logoPicker.noGame")}
          </span>
          <div className="mt-1">
            <Hint content={t("logoPicker.randomHint")}>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={isRolling || available.length < 2}
                onClick={roll}
              >
                <Dices className={cn(isRolling && "animate-spin")} />
                {t("logoPicker.random")}
              </Button>
            </Hint>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 p-3">
        <div
          ref={categoryIndicator.containerRef}
          role="tablist"
          aria-label={t("logoPicker.title")}
          className="relative grid grid-cols-3 gap-0.5 rounded-lg bg-surface-3 p-0.5"
        >
          <SlidingIndicator
            indicator={categoryIndicator}
            variant="fill"
            className="rounded-md bg-surface-1 shadow-xs"
          />
          {LOGO_CATEGORIES.map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={entry === category}
              data-indicator-active={entry === category}
              onClick={() => switchCategory(entry)}
              className={cn(
                "relative flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                entry === category
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`logoPicker.categories.${entry}`)}
              <span className="font-mono text-[0.6rem] text-faint tabular-nums">
                {isReady ? inCategory(entry).length : "…"}
              </span>
            </button>
          ))}
        </div>

        <div
          role="group"
          aria-label={t(`logoPicker.categories.${category}`)}
          onKeyDown={moveCursor}
          className="-mx-1 grid h-[202px] grid-cols-7 content-start gap-1.5 overflow-y-auto p-1"
        >
          {isReady && !pack && (
            <p className="col-span-full flex h-[186px] flex-col items-center justify-center gap-1.5 px-6 text-center">
              <span className="text-sm font-medium">
                {t("logoPicker.noGame")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("logoPicker.noGameHint")}
              </span>
            </p>
          )}
          {!isReady &&
            Array.from({ length: COLUMNS * 4 }, (_, index) => (
              <span
                key={index}
                className="size-11 animate-pulse rounded-lg bg-surface-2"
              />
            ))}
          {presets.map((preset, index) => (
            <PresetTile
              key={preset.id}
              preset={preset}
              pack={pack}
              backdropId={backdrop}
              label={presetName(preset.id)}
              isSelected={preset.id === selected}
              isCursor={index === cursor}
              onFocus={() => setCursor(index)}
              onPick={() => {
                setCursor(index);
                apply(preset, backdrop);
              }}
              onPeek={(active) =>
                setPeekPreset((current) =>
                  active ? preset.id : current === preset.id ? null : current,
                )
              }
              register={(node) => {
                if (node) tiles.current.set(preset.id, node);
                else tiles.current.delete(preset.id);
              }}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <PaintBucket aria-hidden className="size-4 shrink-0 text-faint" />
          <div
            role="group"
            aria-label={t("logoPicker.backdrop")}
            className="flex min-w-0 flex-1 justify-between"
          >
            {LOGO_BACKDROPS.map((entry) => (
              <BackdropSwatch
                key={entry.id}
                backdropId={entry.id}
                label={backdropName(entry.id)}
                isActive={entry.id === backdrop}
                onPick={() => pickBackdrop(entry.id)}
                onPeek={(active) =>
                  setPeekBackdrop((current) =>
                    active ? entry.id : current === entry.id ? null : current,
                  )
                }
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
        <Button type="button" size="sm" variant="ghost" onClick={onPickFile}>
          <ImageUp />
          {t("logoPicker.fromFile")}
        </Button>
        {hasImage && onRemove && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            <Trash2 />
            {t("logoPicker.remove")}
          </Button>
        )}
      </div>
    </div>
  );
}
