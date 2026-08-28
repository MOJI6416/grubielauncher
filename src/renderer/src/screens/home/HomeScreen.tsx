import { useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  m,
  useReducedMotion,
} from "motion/react";
import { LayoutGrid } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { motionTransition } from "@/lib/motion";
import {
  selectedVersionAtom,
  versionsAtom,
  versionsLoadedAtom,
} from "@renderer/stores/atoms";
import { HomeHero } from "@renderer/features/instances/HomeHero";
import { InstanceLibrary } from "@renderer/features/instances/InstanceLibrary";
import { GroupDialog } from "@renderer/features/instances/GroupDialog";
import { TagsDialog } from "@renderer/features/instances/TagsDialog";
import { instanceKey } from "@renderer/features/instances/selectors";
import { useInstanceStatsSync } from "@renderer/features/instances/instanceStats";
import type { RunGameParams } from "@renderer/features/launch/types";

const HERO_HEIGHT = 190;

function HeroPlaceholder() {
  const { t } = useTranslation();

  return (
    <section className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 text-center">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-faint">
        <LayoutGrid className="size-5" />
      </span>
      <div className="flex min-w-0 flex-col gap-1 text-center">
        <p className="truncate text-base font-semibold text-foreground">
          {t("home.noSelection.title")}
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {t("home.noSelection.hint")}
        </p>
      </div>
    </section>
  );
}

export function HomeScreen({
  runGame,
}: {
  runGame: (params: RunGameParams) => Promise<void>;
}) {
  const versions = useAtomValue(versionsAtom);
  const versionsLoaded = useAtomValue(versionsLoadedAtom);
  const selected = useAtomValue(selectedVersionAtom);
  const transition = motionTransition(useReducedMotion());
  const [tagsEditor, setTagsEditor] = useState<{
    key: string;
    name: string;
  } | null>(null);
  const [isGroupDialogOpen, setGroupDialogOpen] = useState(false);

  useInstanceStatsSync(versions);

  const manageTags = (key: string, name: string) =>
    setTagsEditor({ key, name });

  const hasHero = !versionsLoaded || versions.length > 0;
  const slotKey = !versionsLoaded
    ? "loading"
    : selected
      ? `hero:${instanceKey(selected)}`
      : "empty";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {hasHero && (
        <LazyMotion features={domAnimation}>
          <div
            data-home-hero
            style={{ height: HERO_HEIGHT }}
            className="relative shrink-0"
          >
            <AnimatePresence initial={false}>
              <m.div
                key={slotKey}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transition}
                className="absolute inset-0"
              >
                {!versionsLoaded ? (
                  <Skeleton className="size-full rounded-2xl" />
                ) : selected ? (
                  <HomeHero
                    instance={selected}
                    runGame={runGame}
                    onManageTags={manageTags}
                  />
                ) : (
                  <HeroPlaceholder />
                )}
              </m.div>
            </AnimatePresence>
          </div>
        </LazyMotion>
      )}

      <InstanceLibrary
        runGame={runGame}
        onManageTags={manageTags}
        onCreateGroup={() => setGroupDialogOpen(true)}
      />

      {tagsEditor && (
        <TagsDialog
          instanceKey={tagsEditor.key}
          name={tagsEditor.name}
          onClose={() => setTagsEditor(null)}
        />
      )}

      {isGroupDialogOpen && (
        <GroupDialog onClose={() => setGroupDialogOpen(false)} />
      )}
    </div>
  );
}
