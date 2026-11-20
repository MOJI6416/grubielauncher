import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  ImageOff,
  ImagePlus,
  Save,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  BACKDROP_FITS,
  BACKDROP_LIMITS,
  DEFAULT_BACKDROP_FRAME,
  DEFAULT_INFO,
  MAX_THEME_NAME,
  contrastReport,
  themePalette,
  type BackdropFit,
  type ThemeBackdrop,
  type ThemeColors,
  type ThemeDefinition,
  type ThemeMode,
  type ThemeOptionalColor,
} from "@/shared/themes";
import { SegmentedControl } from "@renderer/components/SegmentedControl";
import { Hint } from "@renderer/components/Hint";
import { pickBackdrop } from "./themesStore";
import { BackdropFramer } from "./BackdropFramer";
import { countFeature } from "@renderer/features/usage/usage";

type BaseColor = "background" | "surface" | "foreground";
type OwnColor = "accent" | ThemeOptionalColor;

const BASE_COLORS: BaseColor[] = ["background", "surface", "foreground"];
const OWN_COLORS: OwnColor[] = ["accent", "info", "sidebar", "topbar"];

const OWN_LABEL: Record<OwnColor, string> = {
  accent: "theme.editor.accent",
  info: "theme.editor.info",
  sidebar: "theme.editor.zone.sidebar",
  topbar: "theme.editor.zone.topbar",
};

function ColorField({
  label,
  value,
  own,
  onOwnChange,
  onChange,
}: {
  label: string;
  value: string;
  own?: boolean;
  onOwnChange?: (own: boolean) => void;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const optional = onOwnChange !== undefined;
  const disabled = optional && !own;

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface-1 px-2 py-1.5">
      {optional && (
        <Hint content={t("theme.editor.ownColor", { name: label })}>
          <Checkbox
            checked={own}
            aria-label={t("theme.editor.ownColor", { name: label })}
            onCheckedChange={(checked) => onOwnChange(checked === true)}
          />
        </Hint>
      )}
      <input
        type="color"
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        className="size-7 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-color-swatch]:rounded-[5px] [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
      />
      <span className={cn("grid min-w-0", disabled && "opacity-60")}>
        <Hint content={label} variant="text" truncatedOnly>
          <span className="truncate text-xs text-foreground">{label}</span>
        </Hint>
        <span className="font-mono text-3xs text-faint uppercase">{value}</span>
      </span>
    </div>
  );
}

function BackdropSlider({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <Hint content={label} variant="text" truncatedOnly>
          <span className="min-w-0 truncate text-muted-foreground">{label}</span>
        </Hint>
        <span className="shrink-0 font-mono tabular-nums text-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={1}
        value={[value]}
        onValueChange={([next]) => typeof next === "number" && onChange(next)}
        aria-label={label}
      />
    </div>
  );
}

function Block({
  title,
  description,
  control,
  htmlFor,
  children,
}: {
  title: string;
  description?: string;
  control?: ReactNode;
  htmlFor?: string;
  children?: ReactNode;
}) {
  return (
    <div className="px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
            {title}
          </Label>
          {description && (
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{description}</p>
          )}
        </div>
        {control && <div className="shrink-0">{control}</div>}
      </div>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

export function ThemeEditor({
  draft,
  accent,
  isNew,
  isDirty,
  onChange,
  onSave,
  onCancel,
  onDelete,
}: {
  draft: ThemeDefinition;
  accent: string;
  isNew: boolean;
  isDirty: boolean;
  onChange: (next: ThemeDefinition) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const report = contrastReport(draft, accent);
  const hasFailure = report.some((check) => check.level === "fail");
  const canSave = !hasFailure && !!draft.name.trim();

  const ownDefaults: Record<OwnColor, string> = {
    accent,
    info: DEFAULT_INFO[draft.mode],
    sidebar: themePalette(draft, accent).surface1,
    topbar: draft.colors.background,
  };

  const ownValue = (key: OwnColor): string | undefined =>
    key === "accent" ? (draft.colors.accent ?? undefined) : draft.colors[key];

  const setBase = (key: BaseColor, value: string) =>
    onChange({ ...draft, colors: { ...draft.colors, [key]: value } });

  const setOwn = (key: OwnColor, value: string | null) => {
    if (key === "accent") {
      onChange({ ...draft, colors: { ...draft.colors, accent: value } });
      return;
    }
    const colors: ThemeColors = { ...draft.colors };
    if (value) colors[key] = value;
    else delete colors[key];
    onChange({ ...draft, colors });
  };

  const setBackdrop = (patch: Partial<ThemeBackdrop> | null) =>
    onChange({
      ...draft,
      backdrop:
        patch === null
          ? null
          : ({ ...(draft.backdrop as ThemeBackdrop), ...patch } as ThemeBackdrop),
    });

  const choosePicture = async () => {
    const path = await pickBackdrop();
    if (!path) return;
    countFeature("theme.backdrop");
    onChange({
      ...draft,
      backdrop: {
        path,
        fit: draft.backdrop?.fit ?? DEFAULT_BACKDROP_FRAME.fit,
        focusX: DEFAULT_BACKDROP_FRAME.focusX,
        focusY: DEFAULT_BACKDROP_FRAME.focusY,
        dim: draft.backdrop?.dim ?? BACKDROP_LIMITS.dim.initial,
        blur: draft.backdrop?.blur ?? BACKDROP_LIMITS.blur.initial,
        panelOpacity: draft.backdrop?.panelOpacity ?? BACKDROP_LIMITS.panelOpacity.initial,
      },
    });
  };

  return (
    <div className="flex min-w-0 flex-col">
      <div className="grid grid-cols-2 divide-x divide-border rounded-t-xl border border-border bg-card">
        <div className="flex min-w-0 flex-col divide-y divide-border">
          <Block
            title={t("theme.editor.name")}
            htmlFor="theme-editor-name"
            control={
              <Input
                id="theme-editor-name"
                value={draft.name}
                maxLength={MAX_THEME_NAME}
                onChange={(event) => onChange({ ...draft, name: event.target.value })}
                className="h-8 w-52"
              />
            }
          />

          <Block
            title={t("theme.editor.mode")}
            description={t("theme.editor.modeDescription")}
            control={
              <SegmentedControl<ThemeMode>
                ariaLabel={t("theme.editor.mode")}
                value={draft.mode}
                onChange={(mode) => onChange({ ...draft, mode })}
                options={(["dark", "light"] as ThemeMode[]).map((mode) => ({
                  value: mode,
                  label: t(`theme.editor.modes.${mode}`),
                }))}
              />
            }
          />

          <Block title={t("theme.editor.colors")}>
            <div className="grid grid-cols-3 gap-1.5">
              {BASE_COLORS.map((key) => (
                <ColorField
                  key={key}
                  label={t(`theme.editor.${key}`)}
                  value={draft.colors[key]}
                  onChange={(value) => setBase(key, value)}
                />
              ))}
            </div>
          </Block>

          <Block
            title={t("theme.editor.ownColors")}
            description={t("theme.editor.ownColorsDescription")}
          >
            <div className="grid grid-cols-2 gap-1.5">
              {OWN_COLORS.map((key) => {
                const value = ownValue(key);
                return (
                  <ColorField
                    key={key}
                    label={t(OWN_LABEL[key])}
                    value={value ?? ownDefaults[key]}
                    own={!!value}
                    onOwnChange={(own) => setOwn(key, own ? ownDefaults[key] : null)}
                    onChange={(next) => setOwn(key, next)}
                  />
                );
              })}
            </div>
          </Block>
        </div>

        <div className="flex min-w-0 flex-col divide-y divide-border">
          <Block
            title={t("theme.editor.picture")}
            description={t("theme.editor.pictureDescription")}
            control={
              <div className="flex items-center gap-1">
                <Button variant="secondary" size="sm" onClick={() => void choosePicture()}>
                  <ImagePlus />
                  {draft.backdrop ? t("theme.editor.change") : t("theme.editor.pick")}
                </Button>
                {draft.backdrop && (
                  <Hint content={t("theme.editor.remove")}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("theme.editor.remove")}
                      onClick={() => setBackdrop(null)}
                    >
                      <ImageOff />
                    </Button>
                  </Hint>
                )}
              </div>
            }
          >
            {draft.backdrop && (
              <div className="flex flex-col gap-2">
                <div className="flex items-start gap-3">
                  <BackdropFramer
                    backdrop={draft.backdrop}
                    onChange={(frame) => setBackdrop(frame)}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <BackdropSlider
                      label={t("theme.editor.dim")}
                      value={draft.backdrop.dim}
                      min={BACKDROP_LIMITS.dim.min}
                      max={BACKDROP_LIMITS.dim.max}
                      suffix="%"
                      onChange={(dim) => setBackdrop({ dim })}
                    />
                    <BackdropSlider
                      label={t("theme.editor.blur")}
                      value={draft.backdrop.blur}
                      min={BACKDROP_LIMITS.blur.min}
                      max={BACKDROP_LIMITS.blur.max}
                      suffix=" px"
                      onChange={(blur) => setBackdrop({ blur })}
                    />
                    <BackdropSlider
                      label={t("theme.editor.panelOpacity")}
                      value={draft.backdrop.panelOpacity}
                      min={BACKDROP_LIMITS.panelOpacity.min}
                      max={BACKDROP_LIMITS.panelOpacity.max}
                      suffix="%"
                      onChange={(panelOpacity) => setBackdrop({ panelOpacity })}
                    />
                  </div>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <SegmentedControl<BackdropFit>
                    ariaLabel={t("theme.editor.fit")}
                    value={draft.backdrop.fit}
                    onChange={(fit) => setBackdrop({ fit })}
                    options={BACKDROP_FITS.map((fit) => ({
                      value: fit,
                      label: t(`theme.editor.fits.${fit}`),
                    }))}
                  />
                </div>
                <p className="text-2xs leading-snug text-faint">
                  {t(`theme.editor.fitHints.${draft.backdrop.fit}`)}
                </p>
              </div>
            )}
          </Block>

          <Block
            title={t("theme.editor.readability")}
            description={t("theme.editor.readabilityDescription")}
          >
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
              {report.map((check) => (
                <li key={check.id} className="flex min-w-0 items-center gap-1.5 text-xs">
                  {check.level === "ok" ? (
                    <Check className="size-3.5 shrink-0 text-success" />
                  ) : check.level === "warn" ? (
                    <TriangleAlert className="size-3.5 shrink-0 text-warning" />
                  ) : (
                    <X className="size-3.5 shrink-0 text-destructive" />
                  )}
                  <Hint content={t(`theme.checks.${check.id}`)} variant="text" truncatedOnly>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {t(`theme.checks.${check.id}`)}
                    </span>
                  </Hint>
                  <span
                    className={cn(
                      "shrink-0 font-mono whitespace-nowrap tabular-nums",
                      check.level === "fail" ? "text-destructive" : "text-faint",
                    )}
                  >
                    {check.ratio.toFixed(1)}:1
                  </span>
                </li>
              ))}
            </ul>
          </Block>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex min-w-0 items-center gap-2 rounded-b-xl border border-t-0 border-border bg-card px-3.5 py-2 backdrop-blur-md">
        {!isNew && (
          <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
            <Trash2 />
            {t("theme.delete")}
          </Button>
        )}
        {hasFailure ? (
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-destructive">
            <TriangleAlert className="size-3.5 shrink-0" />
            <Hint content={t("theme.editor.blocked")} variant="text" truncatedOnly>
              <span className="truncate">{t("theme.editor.blocked")}</span>
            </Hint>
          </span>
        ) : (
          isDirty && (
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-warning" />
              <Hint content={t("theme.editor.unsaved")} variant="text" truncatedOnly>
                <span className="truncate">{t("theme.editor.unsaved")}</span>
              </Hint>
            </span>
          )
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button variant="secondary" size="sm" disabled={!canSave} onClick={onSave}>
            <Save />
            {t("theme.editor.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
