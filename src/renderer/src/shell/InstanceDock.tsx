import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Hint } from "@renderer/components/Hint";
import { getLoaderInfo } from "@renderer/components/Loaders";
import { InstanceArt } from "@renderer/features/instances/InstanceArt";
import {
  consolesMetaAtom,
  isRunningAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import {
  activityTime,
  instanceKey,
} from "@renderer/features/instances/selectors";
import { openNewInstance } from "@renderer/features/instances/newInstance";
import { currentRouteAtom } from "@renderer/navigation/store";
import { navigate } from "@renderer/navigation/navigate";

export function InstanceDock() {
  const versions = useAtomValue(versionsAtom);
  const consoleMetas = useAtomValue(consolesMetaAtom);
  const isRunning = useAtomValue(isRunningAtom);
  const route = useAtomValue(currentRouteAtom);
  const { t } = useTranslation();

  const ordered = useMemo(
    () => [...versions].sort((a, b) => activityTime(b) - activityTime(a)),
    [versions],
  );

  const running = useMemo(
    () =>
      new Set(
        consoleMetas
          .filter((meta) => meta.status === "running")
          .map((meta) => meta.versionName),
      ),
    [consoleMetas],
  );

  const activeId = route.name === "instance" ? route.id : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-4">
      <div className="flex h-6 shrink-0 items-center gap-1.5 px-2.5">
        <span className="text-[0.65rem] font-semibold tracking-[0.09em] text-faint uppercase">
          {t("shell.nav.instances")}
        </span>
        {versions.length > 0 && (
          <span className="font-mono text-[0.65rem] tabular-nums text-faint">
            {versions.length}
          </span>
        )}
        <Hint content={t("shell.nav.newInstance")} wrapperClassName="ml-auto">
          <button
            type="button"
            disabled={isRunning}
            data-focus-key="new-instance-dock"
            aria-label={t("shell.nav.newInstance")}
            onClick={() => openNewInstance()}
            className="ml-auto flex size-5 items-center justify-center rounded-md text-faint transition-colors hover:bg-sidebar-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus className="size-3.5" />
          </button>
        </Hint>
      </div>

      {ordered.length > 0 && (
        <div className="mt-0.5 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-0.5">
          {ordered.map((instance) => {
            const key = instanceKey(instance);
            const loader = getLoaderInfo(instance.version.loader.name);
            const isActive = key === activeId;

            return (
              <button
                key={key}
                type="button"
                aria-current={isActive}
                onClick={() => navigate({ name: "instance", id: key })}
                className="flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors hover:bg-sidebar-accent aria-[current=true]:bg-primary-soft"
              >
                <InstanceArt
                  name={instance.version.name}
                  image={instance.version.image}
                  className="size-6 rounded-md"
                  textClassName="font-mono text-[0.6rem]"
                />

                <span className="grid min-w-0 flex-1">
                  <Hint
                    content={instance.version.name}
                    variant="text"
                    side="right"
                    truncatedOnly
                  >
                    <span className="truncate text-[0.8rem] leading-4 text-foreground">
                      {instance.version.name}
                    </span>
                  </Hint>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${loader.dot}`}
                    />
                    <span className="truncate font-mono text-[0.65rem] leading-4 text-faint">
                      {instance.version.version.id}
                    </span>
                  </span>
                </span>

                {running.has(instance.version.name) && (
                  <span className="size-1.5 shrink-0 rounded-full bg-success" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
