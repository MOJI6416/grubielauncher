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
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  BACKDROP_LIMITS,
  MAX_THEME_NAME,
  contrastReport,
  type ThemeBackdrop,
  type ThemeColors,
  type ThemeDefinition,
  type ThemeMode,
} from "@/shared/themes";
import { SettingRow, SettingsGroup, Segmented } from "@renderer/features/settings/SettingsPrimitives";
import { backdropUrl, pickBackdrop } from "./themesStore";

type ColorKey = keyof ThemeColors;

const COLOR_KEYS: ColorKey[] = ["background", "surface", "foreground", "accent"];

function ColorField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-2.5 rounded-lg border border-border bg-surface-1 px-2.5 py-2",
        disabled && "opacity-50",
      )}
    >
      <input
        type="color"
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        className="size-7 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0 disabled:cursor-not-allowed [&::-webkit-color-swatch]:rounded-[5px] [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
      />
      <span className="grid min-w-0">
        <span className="truncate text-xs text-foreground">{label}</span>
        <span className="font-mono text-[0.65rem] text-faint uppercase">{value}</span>
      </span>
    </label>
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
    <div className="flex items-center gap-3">
      <span className="w-40 shrink-0 text-xs text-muted-foreground">{label}</span>
      <Slider
        min={min}
        max={max}
        step={1}
        value={[value]}
        onValueChange={([next]) => typeof next === "number" && onChange(next)}
        aria-label={label}
        className="flex-1"
      />
      <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
        {value}
        {suffix}
      </span>
    </div>
  );
}

export function ThemeEditor({
  draft,
  accent,
  isNew,
  onChange,
  onSave,
  onCancel,
  onDelete,
}: {
  draft: ThemeDefinition;
  accent: string;
  isNew: boolean;
  onChange: (next: ThemeDefinition) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const report = contrastReport(draft, accent);
  const hasFailure = report.some((check) => check.level === "fail");

  const setColor = (key: ColorKey, value: string | null) =>
    onChange({ ...draft, colors: { ...draft.colors, [key]: value } });

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
    onChange({
      ...draft,
      backdrop: {
        path,
        dim: draft.backdrop?.dim ?? BACKDROP_LIMITS.dim.initial,
        blur: draft.backdrop?.blur ?? BACKDROP_LIMITS.blur.initial,
        panelOpacity: draft.backdrop?.panelOpacity ?? BACKDROP_LIMITS.panelOpacity.initial,
      },
    });
  };

  return (
    <SettingsGroup title={t("theme.editor.title")} hint={t("theme.editor.livePreview")}>
      <SettingRow
        title={t("theme.editor.name")}
        control={
          <Input
            value={draft.name}
            maxLength={MAX_THEME_NAME}
            aria-label={t("theme.editor.name")}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
            className="h-8 w-56"
          />
        }
      />

      <SettingRow
        title={t("theme.editor.mode")}
        description={t("theme.editor.modeDescription")}
        control={
          <Segmented<ThemeMode>
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

      <SettingRow title={t("theme.editor.colors")}>
        <div className="mt-2.5 grid grid-cols-4 gap-2">
          {COLOR_KEYS.map((key) => (
            <ColorField
              key={key}
              label={t(`theme.editor.${key}`)}
              value={key === "accent" ? (draft.colors.accent ?? accent) : draft.colors[key]!}
              disabled={key === "accent" && draft.colors.accent === null}
              onChange={(value) => setColor(key, value)}
            />
          ))}
        </div>
        <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={draft.colors.accent !== null}
            onCheckedChange={(checked) => setColor("accent", checked === true ? accent : null)}
          />
          {t("theme.editor.ownAccent")}
        </label>
      </SettingRow>

      <SettingRow
        title={t("theme.editor.picture")}
        description={t("theme.editor.pictureDescription")}
        control={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void choosePicture()}>
              <ImagePlus />
              {draft.backdrop ? t("theme.editor.change") : t("theme.editor.pick")}
            </Button>
            {draft.backdrop && (
              <Button variant="ghost" size="sm" onClick={() => setBackdrop(null)}>
                <ImageOff />
                {t("theme.editor.remove")}
              </Button>
            )}
          </div>
        }
      >
        {draft.backdrop && (
          <div className="mt-2.5 flex items-center gap-4">
            <span
              aria-hidden
              className="h-16 w-28 shrink-0 rounded-md border border-border bg-cover bg-center"
              style={{ backgroundImage: `url("${backdropUrl(draft.backdrop.path)}")` }}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
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
        )}
      </SettingRow>

      <SettingRow title={t("theme.editor.readability")} description={t("theme.editor.readabilityDescription")}>
        <ul className="mt-2.5 grid grid-cols-2 gap-x-6 gap-y-1.5">
          {report.map((check) => (
            <li key={check.id} className="flex items-center gap-2 text-xs">
              {check.level === "ok" ? (
                <Check className="size-3.5 shrink-0 text-success" />
              ) : check.level === "warn" ? (
                <TriangleAlert className="size-3.5 shrink-0 text-warning" />
              ) : (
                <X className="size-3.5 shrink-0 text-destructive" />
              )}
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {t(`theme.checks.${check.id}`)}
              </span>
              <span
                className={cn(
                  "shrink-0 font-mono tabular-nums",
                  check.level === "fail" ? "text-destructive" : "text-faint",
                )}
              >
                {check.ratio.toFixed(1)}:1
              </span>
            </li>
          ))}
        </ul>
      </SettingRow>

      <div className="flex items-center gap-2 px-3.5 py-2.5">
        {!isNew && (
          <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
            <Trash2 />
            {t("theme.delete")}
          </Button>
        )}
        {hasFailure && (
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-destructive">
            <TriangleAlert className="size-3.5 shrink-0" />
            <span className="truncate">{t("theme.editor.blocked")}</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button size="sm" disabled={hasFailure || !draft.name.trim()} onClick={onSave}>
            <Save />
            {t("theme.editor.save")}
          </Button>
        </div>
      </div>
    </SettingsGroup>
  );
}
