import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@renderer/components/SegmentedControl";
import { GPU_PREFERENCES, type GpuPreference } from "@/shared/gpuPreference";
import type { GraphicsBackend } from "@/shared/graphicsBackend";
import {
  parseLaunchEnv,
  splitCommandLine,
  type LinuxLaunchTools,
} from "@/shared/launchCommand";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";

const api = window.api;

export function GpuPreferenceControl({
  value,
  onChange,
  disabled,
}: {
  value: GpuPreference;
  onChange: (value: GpuPreference) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <SegmentedControl
      value={value}
      disabled={disabled}
      ariaLabel={t("launchSettings.gpu.title")}
      onChange={onChange}
      options={GPU_PREFERENCES.map((preference) => ({
        value: preference,
        label: t(`launchSettings.gpu.${preference}`),
      }))}
    />
  );
}

type BackendChoice = GraphicsBackend | "game";

export function GraphicsBackendControl({
  value,
  onChange,
  disabled,
  forcedByShaders,
}: {
  value: GraphicsBackend | null;
  onChange: (value: GraphicsBackend | null) => void;
  disabled?: boolean;
  forcedByShaders?: boolean;
}) {
  const { t } = useTranslation();
  const choices: BackendChoice[] = ["game", "opengl", "vulkan"];

  return (
    <SegmentedControl<BackendChoice>
      value={forcedByShaders ? "opengl" : (value ?? "game")}
      disabled={disabled || forcedByShaders}
      ariaLabel={t("launchSettings.backend.title")}
      onChange={(choice) => onChange(choice === "game" ? null : choice)}
      options={choices.map((choice) => ({
        value: choice,
        label: t(`launchSettings.backend.${choice}`),
      }))}
    />
  );
}

export function useLinuxLaunchTools(enabled: boolean): LinuxLaunchTools | null {
  const [tools, setTools] = useState<LinuxLaunchTools | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void api.os
      .launchTools()
      .catch(ignoreFailure)
      .then((result) => {
        if (!cancelled) setTools(result ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return tools;
}

export interface LinuxLaunchValues {
  gameMode: boolean;
  mangoHud: boolean;
  wrapperCommand: string;
  launchEnv: string;
  preLaunchCommand: string;
  postExitCommand: string;
}

function FieldLabel({
  htmlFor,
  title,
  description,
  warning,
}: {
  htmlFor: string;
  title: string;
  description: string;
  warning?: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <label htmlFor={htmlFor} className="text-sm text-foreground">
        {title}
      </label>
      <p className="text-xs leading-snug text-muted-foreground">
        {description}
      </p>
      {warning && (
        <p className="flex items-start gap-1 text-xs leading-snug text-warning">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          <span>{warning}</span>
        </p>
      )}
    </div>
  );
}

function DraftInput({
  id,
  value,
  placeholder,
  disabled,
  multiline,
  onCommit,
}: {
  id: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  multiline?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  const shared = {
    id,
    value: draft,
    placeholder,
    disabled,
    spellCheck: false,
    autoComplete: "off",
    onBlur: commit,
    className: "font-mono text-xs",
  };

  return multiline ? (
    <Textarea
      {...shared}
      rows={3}
      className={cn(shared.className, "min-h-0 resize-none")}
      onChange={(event) => setDraft(event.target.value)}
    />
  ) : (
    <Input
      {...shared}
      className={cn(shared.className, "h-8")}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
    />
  );
}

function ToolSwitch({
  id,
  title,
  description,
  checked,
  installed,
  packageName,
  disabled,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  installed: boolean | null;
  packageName: string;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-start justify-between gap-4">
      <FieldLabel
        htmlFor={id}
        title={title}
        description={description}
        warning={
          checked && installed === false
            ? t("launchSettings.linux.missing", { name: packageName })
            : null
        }
      />
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  );
}

export function LinuxLaunchFields({
  idPrefix,
  values,
  tools,
  disabled,
  onChange,
  footer,
}: {
  idPrefix: string;
  values: LinuxLaunchValues;
  tools: LinuxLaunchTools | null;
  disabled?: boolean;
  onChange: (patch: Partial<LinuxLaunchValues>) => void;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const invalidEnv = parseLaunchEnv(values.launchEnv).invalid;
  const wrapperBroken =
    values.wrapperCommand.trim() !== "" &&
    splitCommandLine(values.wrapperCommand) === null;

  return (
    <div className="flex flex-col gap-3">
      <ToolSwitch
        id={`${idPrefix}-gamemode`}
        title={t("launchSettings.linux.gameMode")}
        description={t("launchSettings.linux.gameModeDescription")}
        checked={values.gameMode}
        installed={tools ? tools.installed.gamemode : null}
        packageName="gamemode"
        disabled={disabled}
        onChange={(gameMode) => onChange({ gameMode })}
      />
      <ToolSwitch
        id={`${idPrefix}-mangohud`}
        title={t("launchSettings.linux.mangoHud")}
        description={t("launchSettings.linux.mangoHudDescription")}
        checked={values.mangoHud}
        installed={tools ? tools.installed.mangohud : null}
        packageName="mangohud"
        disabled={disabled}
        onChange={(mangoHud) => onChange({ mangoHud })}
      />

      <div className="flex flex-col gap-1.5">
        <FieldLabel
          htmlFor={`${idPrefix}-wrapper`}
          title={t("launchSettings.linux.wrapper")}
          description={t("launchSettings.linux.wrapperDescription")}
          warning={
            wrapperBroken ? t("launchSettings.linux.wrapperBroken") : null
          }
        />
        <DraftInput
          id={`${idPrefix}-wrapper`}
          value={values.wrapperCommand}
          placeholder="prime-run"
          disabled={disabled}
          onCommit={(wrapperCommand) => onChange({ wrapperCommand })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel
          htmlFor={`${idPrefix}-env`}
          title={t("launchSettings.linux.env")}
          description={t("launchSettings.linux.envDescription")}
          warning={
            invalidEnv.length > 0
              ? t("launchSettings.linux.envInvalid", { line: invalidEnv[0] })
              : null
          }
        />
        <DraftInput
          id={`${idPrefix}-env`}
          multiline
          value={values.launchEnv}
          placeholder={
            "__GL_THREADED_OPTIMIZATIONS=1\nMESA_GL_VERSION_OVERRIDE=4.6"
          }
          disabled={disabled}
          onCommit={(launchEnv) => onChange({ launchEnv })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel
          htmlFor={`${idPrefix}-pre`}
          title={t("launchSettings.linux.preLaunch")}
          description={t("launchSettings.linux.preLaunchDescription")}
        />
        <DraftInput
          id={`${idPrefix}-pre`}
          value={values.preLaunchCommand}
          placeholder={'notify-send "$INST_NAME"'}
          disabled={disabled}
          onCommit={(preLaunchCommand) => onChange({ preLaunchCommand })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel
          htmlFor={`${idPrefix}-post`}
          title={t("launchSettings.linux.postExit")}
          description={t("launchSettings.linux.postExitDescription")}
        />
        <DraftInput
          id={`${idPrefix}-post`}
          value={values.postExitCommand}
          placeholder={'echo "$INST_EXIT_CODE" >> ~/minecraft-exits.log'}
          disabled={disabled}
          onCommit={(postExitCommand) => onChange({ postExitCommand })}
        />
      </div>

      {footer}
    </div>
  );
}
