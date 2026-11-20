import { Dispatch, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CircleCheck, Gauge, Loader2, RotateCw } from "lucide-react";
import {
  forgeFit,
  optifineBuildsFor,
  optifineLabel,
  optifineOffer,
  toOptiFineChoice,
} from "@/shared/optifine";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { countFeature } from "@renderer/features/usage/usage";
import { takeNewInstancePreset } from "@renderer/features/instances/newInstance";
import type {
  NewInstanceAction,
  NewInstanceState,
} from "@renderer/features/newInstance/state";
import { useOptiFineBuilds, useOptiFineStored } from "./useOptiFineBuilds";
import { hasSodiumIris, resolveSodiumIris } from "./optifineActions";

const NONE = "none";

function useSwitchToSodiumIris(dispatch: Dispatch<NewInstanceAction>) {
  const { t } = useTranslation();
  const [isResolving, setIsResolving] = useState(false);

  const run = (minecraft: string) => {
    dispatch({ type: "applyLoaderPreset", loader: "fabric", minecraft });
    setIsResolving(true);
    resolveSodiumIris(minecraft, "fabric")
      .then((mods) => {
        if (mods.length === 0) throw new Error("nothing resolved");
        dispatch({ type: "setMods", mods });
      })
      .catch(() => toast.error(t("optifine.create.sodiumFailed")))
      .finally(() => setIsResolving(false));
  };

  return { run, isResolving };
}

export function useNewInstancePreset(dispatch: Dispatch<NewInstanceAction>) {
  const { run } = useSwitchToSodiumIris(dispatch);
  const appliedRef = useRef(false);

  useEffect(() => {
    if (appliedRef.current) return;
    appliedRef.current = true;

    const preset = takeNewInstancePreset();
    if (!preset) return;
    if (preset.sodiumIris && preset.loader === "fabric") {
      run(preset.minecraft);
      return;
    }
    dispatch({
      type: "applyLoaderPreset",
      loader: preset.loader,
      minecraft: preset.minecraft,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function Row({
  children,
  note,
}: {
  children: React.ReactNode;
  note?: React.ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="border-t border-border/60">
      <div className="flex min-h-9 items-center gap-2 px-2.5 py-1.5">
        <Gauge className="size-3.5 shrink-0 text-faint" />
        <span className="shrink-0 text-xs text-muted-foreground">
          {t("optifine.title")}
        </span>
        {children}
      </div>
      {note && (
        <div className="px-2.5 pb-2 text-2xs leading-snug text-muted-foreground">
          {note}
        </div>
      )}
    </div>
  );
}

export function OptiFineCreateRow({
  state,
  dispatch,
}: {
  state: NewInstanceState;
  dispatch: Dispatch<NewInstanceAction>;
}) {
  const { t } = useTranslation();
  const minecraft = state.minecraftVersion?.id;
  const offer = minecraft ? optifineOffer(minecraft, state.loader) : null;
  const catalog = useOptiFineBuilds(minecraft, offer === "optifine");
  const sodium = useSwitchToSodiumIris(dispatch);

  const builds = useMemo(
    () =>
      minecraft ? optifineBuildsFor(catalog.builds, minecraft, state.loader) : [],
    [catalog.builds, minecraft, state.loader],
  );
  const selected = builds.find((build) => build.file === state.optifine?.file);
  const stored = useOptiFineStored(state.optifine);

  if (!minecraft) return null;

  if (offer === "sodium") {
    return (
      <Row
        note={
          <>
            <span className="block text-foreground first-letter:uppercase">
              {t("optifine.sodium.better")}
            </span>
            {t("optifine.sodium.why")}
          </>
        }
      >
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="ml-auto shrink-0"
          disabled={sodium.isResolving}
          onClick={() => {
            countFeature("optifine.sodium");
            sodium.run(minecraft);
          }}
        >
          {sodium.isResolving && <Loader2 className="animate-spin" />}
          {t("optifine.create.sodiumAction")}
        </Button>
      </Row>
    );
  }

  if (offer !== "optifine") {
    if (state.loader === "fabric" && hasSodiumIris(state.mods)) {
      return (
        <div className="flex h-9 items-center gap-2 border-t border-border/60 px-2.5 text-xs">
          <CircleCheck className="size-3.5 shrink-0 text-success" />
          <Hint content={t("optifine.create.sodiumAdded")} variant="text" truncatedOnly>
            <span className="min-w-0 truncate text-muted-foreground">
              {t("optifine.create.sodiumAdded")}
            </span>
          </Hint>
        </div>
      );
    }
    return null;
  }

  const fit =
    selected && state.loader === "forge"
      ? forgeFit(selected, state.loaderVersion?.id)
      : "ok";

  const note = catalog.isLoading ? (
    <span className="flex items-center gap-1.5">
      <Loader2 className="size-3 animate-spin" />
      {t("optifine.list.loading")}
    </span>
  ) : catalog.failed ? (
    <span className="flex items-center gap-1.5">
      {t("optifine.list.siteFailed")}
      <Button
        type="button"
        size="xs"
        variant="ghost"
        className="h-5 px-1.5 text-2xs"
        onClick={catalog.reload}
      >
        <RotateCw />
        {t("common.retry")}
      </Button>
    </span>
  ) : builds.length === 0 ? (
    t(
      state.loader === "forge"
        ? "optifine.list.emptyForge"
        : "optifine.list.empty",
      { version: minecraft },
    )
  ) : selected ? (
    <>
      {fit === "older" && (
        <span className="block text-warning">
          {t("optifine.notes.forgeOlder", { version: selected.forge })}
        </span>
      )}
      {stored ? (
        <span className="flex items-center gap-1.5">
          <CircleCheck className="size-3 text-success" />
          {t("optifine.create.stored")}
        </span>
      ) : (
        t("optifine.create.willDownload")
      )}
    </>
  ) : null;

  return (
    <Row note={note}>
      <Select
        value={selected?.file ?? NONE}
        disabled={builds.length === 0}
        onValueChange={(value) => {
          const build = builds.find((item) => item.file === value);
          dispatch({
            type: "setOptiFine",
            value: build ? toOptiFineChoice(build) : null,
          });
        }}
      >
        <SelectTrigger
          size="sm"
          className="ml-auto h-7 w-auto max-w-44 min-w-0 text-xs"
          aria-label={t("optifine.title")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value={NONE}>{t("optifine.create.none")}</SelectItem>
          {builds.map((build) => (
            <SelectItem key={build.file} value={build.file}>
              <span className="font-mono">{optifineLabel(build.edition)}</span>
              {build.date && (
                <span className="ml-1.5 font-mono text-2xs text-faint">
                  {build.date}
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Row>
  );
}
