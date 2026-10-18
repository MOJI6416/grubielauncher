import { useEffect, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, Loader2, Undo2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveInstanceSettings } from "@/shared/instanceSettings";
import { settingsAtom, versionsAtom } from "@renderer/stores/atoms";
import { modIdentities } from "@renderer/features/configs/modGroups";
import { formatBytes } from "@renderer/utilities/file";
import { useRedact } from "@renderer/features/streamer/streamerMode";
import type { AgentUndo, ToolResult } from "@renderer/agent/types";
import { CrashFix, CrashFixIdentity, planCrashFixes } from "./crashFixPlan";

const api = window.api;

type FixState = {
  phase: "running" | "done" | "undoing" | "undone";
  undo?: AgentUndo;
};

function fixKey(fix: CrashFix): string {
  return fix.kind === "disableMod" ? `${fix.kind}:${fix.title}` : fix.kind;
}

async function applyFix(instance: string, fix: CrashFix): Promise<ToolResult> {
  if (fix.kind === "memory") {
    const { setMemory } = await import("@renderer/agent/tools/mutations");
    return setMemory.run({ instance, memoryMb: fix.toMb });
  }

  const { toggleMods, checkIntegrity } = await import(
    "@renderer/agent/tools/repair"
  );

  return fix.kind === "integrity"
    ? checkIntegrity.run({ instance })
    : toggleMods.run({ instance, titles: [fix.title], enabled: false });
}

export function CrashFixes({
  versionName,
  ruleId,
  culprits,
}: {
  versionName: string | null | undefined;
  ruleId: string | null;
  culprits: string[];
}) {
  const { t } = useTranslation();
  const redact = useRedact();
  const versions = useAtomValue(versionsAtom);
  const settings = useAtomValue(settingsAtom);
  const [identities, setIdentities] = useState<CrashFixIdentity[]>([]);
  const [totalMemoryMb, setTotalMemoryMb] = useState(0);
  const [states, setStates] = useState<Record<string, FixState>>({});

  const version = versions.find((entry) => entry.version.name === versionName);
  const versionPath = version?.versionPath;
  const mods = version?.version.loader.mods;
  const culpritKey = culprits.join("\n");

  useEffect(() => {
    if (!versionPath || !mods || culpritKey === "") {
      setIdentities((current) => (current.length === 0 ? current : []));
      return;
    }

    let cancelled = false;

    void api.modManager
      .localDependencies(versionPath)
      .catch(() => ({}))
      .then((index) => {
        if (!cancelled) setIdentities(modIdentities(mods, index));
      });

    return () => {
      cancelled = true;
    };
  }, [versionPath, mods, culpritKey]);

  useEffect(() => {
    if (ruleId !== "out_of_memory") return;

    void api.os
      .totalmem()
      .catch(() => 0)
      .then((bytes) => setTotalMemoryMb(Math.round(bytes / (1024 * 1024))));
  }, [ruleId]);

  const fixes = useMemo(
    () =>
      version
        ? planCrashFixes({
            ruleId,
            culprits: culpritKey === "" ? [] : culpritKey.split("\n"),
            identities,
            memoryMb: resolveInstanceSettings(
              settings,
              version.version.overrides,
            ).xmx,
            totalMemoryMb,
          })
        : [],
    [version, ruleId, culpritKey, identities, settings, totalMemoryMb],
  );

  if (!version || fixes.length === 0) return null;

  const memoryLabel = (megabytes: number) =>
    formatBytes(
      megabytes * 1024 * 1024,
      [0, 1, 2, 3, 4].map((index) => t(`sizes.${index}`)),
      1,
    );

  const label = (fix: CrashFix) =>
    fix.kind === "disableMod"
      ? t("crashFix.disableMod", { name: redact.text(fix.title) })
      : fix.kind === "memory"
        ? t("crashFix.memory", {
            from: memoryLabel(fix.fromMb),
            to: memoryLabel(fix.toMb),
          })
        : t("versions.checkIntegrity");

  const doneLabel = (fix: CrashFix) =>
    fix.kind === "disableMod"
      ? t("crashFix.disabledMod", { name: redact.text(fix.title) })
      : fix.kind === "memory"
        ? t("crashFix.memoryDone", { to: memoryLabel(fix.toMb) })
        : t("versions.integrityOk");

  const setState = (key: string, state: FixState | null) =>
    setStates((current) => {
      const next = { ...current };
      if (state) next[key] = state;
      else delete next[key];
      return next;
    });

  const apply = async (fix: CrashFix) => {
    const key = fixKey(fix);
    setState(key, { phase: "running" });

    const result = await applyFix(version.version.name, fix).catch(
      (error): ToolResult => ({ ok: false, error: String(error) }),
    );

    if (!result.ok) {
      setState(key, null);
      toast.error(t("crashFix.failed"), { description: result.error });
      return;
    }

    setState(key, { phase: "done", undo: result.undo });
  };

  const undo = async (fix: CrashFix, state: FixState) => {
    if (!state.undo) return;

    const key = fixKey(fix);
    setState(key, { ...state, phase: "undoing" });

    const { runUndo } = await import("@renderer/agent/undo");
    const result = await runUndo(state.undo).catch(
      (error): ToolResult => ({ ok: false, error: String(error) }),
    );

    if (!result.ok) {
      setState(key, state);
      toast.error(t("crashFix.failed"), { description: result.error });
      return;
    }

    setState(key, { phase: "undone" });
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Wrench className="size-3.5 text-faint" />
        {t("crashFix.title")}
      </span>

      {fixes.map((fix) => {
        const key = fixKey(fix);
        const state = states[key];

        if (state?.phase === "done" || state?.phase === "undoing") {
          return (
            <span
              key={key}
              className="flex h-7 min-w-0 items-center gap-1 rounded-md border border-success/40 pl-2 text-xs text-success"
            >
              <Check className="size-3.5 shrink-0" />
              <span className="min-w-0 truncate">{doneLabel(fix)}</span>
              {state.undo && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-[0.7rem] text-muted-foreground"
                  disabled={state.phase === "undoing"}
                  onClick={() => void undo(fix, state)}
                >
                  {state.phase === "undoing" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Undo2 className="size-3" />
                  )}
                  {t("agent.undo.action")}
                </Button>
              )}
            </span>
          );
        }

        return (
          <Button
            key={key}
            size="sm"
            variant="outline"
            className="h-7 max-w-full text-xs"
            disabled={state?.phase === "running"}
            onClick={() => void apply(fix)}
          >
            {state?.phase === "running" && (
              <Loader2 className="size-3.5 animate-spin" />
            )}
            <span className="min-w-0 truncate">
              {state?.phase === "undone"
                ? `${label(fix)} · ${t("agent.undo.done")}`
                : label(fix)}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
