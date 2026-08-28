import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Cpu,
  Download,
  HardDrive,
  Headphones,
  Info,
  Loader2,
  Palette,
  RotateCcw,
  Search,
  Shield,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { navigate } from "@renderer/navigation/navigate";
import {
  SETTINGS_ENTRIES,
  SETTINGS_SECTIONS,
  changedCountBySection,
  changedEntryIds,
  defaultsPatch,
  entrySection,
  isSettingsSection,
  sectionEntryIds,
  type SettingsEntryId,
  type SettingsSectionId,
} from "@renderer/features/settings/catalog";
import {
  searchSettings,
  type SettingsSearchEntry,
} from "@renderer/features/settings/search";
import { useSettingsWriter } from "@renderer/features/settings/useSettingsWriter";
import { useSystemFacts } from "@renderer/features/settings/useSystemFacts";
import { GameSection } from "@renderer/features/settings/GameSection";
import { DownloadsSection } from "@renderer/features/settings/DownloadsSection";
import { InterfaceSection } from "@renderer/features/settings/InterfaceSection";
import { VoiceSection } from "@renderer/features/settings/VoiceSection";
import { PrivacySection } from "@renderer/features/settings/PrivacySection";
import { StorageSection } from "@renderer/features/settings/StorageSection";
import { AboutSection } from "@renderer/features/settings/AboutSection";

const SECTION_ICON: Record<SettingsSectionId, LucideIcon> = {
  game: Cpu,
  downloads: Download,
  interface: Palette,
  voice: Headphones,
  privacy: Shield,
  storage: HardDrive,
  about: Info,
};

export function SettingsScreen({
  section,
  onShowWhatsNew,
}: {
  section?: string;
  onShowWhatsNew?: () => void;
}) {
  const { t } = useTranslation();
  const { settings, status, commit } = useSettingsWriter();
  const { appVersion, totalMemoryMb } = useSystemFacts();

  const [query, setQuery] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [isResetOpen, setResetOpen] = useState(false);
  const [storageTotal, setStorageTotal] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const active: SettingsSectionId = isSettingsSection(section)
    ? section
    : "game";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.code === "KeyF") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const searchEntries = useMemo<SettingsSearchEntry[]>(
    () =>
      SETTINGS_ENTRIES.map((entry) => ({
        id: entry.id,
        section: entry.section,
        title: t(`settings.index.${entry.id}.title`),
        description: t(`settings.index.${entry.id}.description`),
        keywords: t(`settings.index.${entry.id}.keywords`),
      })),
    [t],
  );

  const changedIds = useMemo(() => changedEntryIds(settings), [settings]);
  const changedSet = useMemo(() => new Set(changedIds), [changedIds]);
  const changedCounts = useMemo(
    () => changedCountBySection(settings),
    [settings],
  );

  const result = useMemo(
    () => searchSettings(searchEntries, query),
    [searchEntries, query],
  );

  const isFiltering = query.trim().length > 0 || onlyChanged;

  const matchedIds = useMemo(() => {
    if (!onlyChanged) return result.matchedIds;
    return new Set([...result.matchedIds].filter((id) => changedSet.has(id)));
  }, [result.matchedIds, onlyChanged, changedSet]);

  const visibleSections = useMemo(() => {
    if (!isFiltering) return SETTINGS_SECTIONS;
    const found = new Set(
      [...matchedIds].map((id) => entrySection(id as SettingsEntryId)),
    );
    return SETTINGS_SECTIONS.filter((id) => found.has(id));
  }, [isFiltering, matchedIds]);

  useEffect(() => {
    if (!isFiltering) return;
    if (visibleSections.length === 0) return;
    if (visibleSections.includes(active)) return;
    navigate(
      { name: "settings", section: visibleSections[0] },
      { replace: true },
    );
  }, [isFiltering, visibleSections, active]);

  const visible = (id: SettingsEntryId) =>
    !isFiltering || matchedIds.has(id);
  const isChanged = (id: SettingsEntryId) => changedSet.has(id);
  const reset = (id: SettingsEntryId) => {
    void commit(defaultsPatch(settings, [id]));
  };

  const sectionProps = {
    settings,
    commit: (patch: Parameters<typeof commit>[0]) => void commit(patch),
    visible,
    query: result.query,
    isChanged,
    reset,
  };

  const sectionHasVisibleRows = sectionEntryIds(active).some(visible);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <header className="flex shrink-0 items-center gap-2">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.stopPropagation();
                setQuery("");
              }
            }}
            placeholder={t("settings.search.placeholder")}
            aria-label={t("settings.search.placeholder")}
            className="h-8 pr-7 pl-8 text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("common.cancel")}
              className="absolute top-1/2 right-2 flex size-4 -translate-y-1/2 items-center justify-center rounded text-faint hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOnlyChanged((value) => !value)}
          aria-pressed={onlyChanged}
          disabled={changedIds.length === 0}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            onlyChanged
              ? "border-primary/50 bg-primary-soft text-foreground"
              : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="size-1.5 rounded-full bg-primary" />
          {t("settings.onlyChanged")}
          <span className="font-mono tabular-nums text-faint">
            {changedIds.length}
          </span>
        </button>

        {query.trim() && (
          <span className="text-xs text-faint">
            {t("settings.search.results", { value: matchedIds.size })}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <SaveIndicator status={status} />
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={changedIds.length === 0}
            onClick={() => setResetOpen(true)}
          >
            <RotateCcw className="size-3.5" />
            {t("settings.resetAll")}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-3">
        <nav className="flex w-48 shrink-0 flex-col gap-0.5 overflow-y-auto rounded-xl border border-border bg-card p-2">
          {SETTINGS_SECTIONS.map((id) => {
            const Icon = SECTION_ICON[id];
            const isDimmed = isFiltering && !visibleSections.includes(id);
            const count = isFiltering
              ? [...matchedIds].filter(
                  (entry) => entrySection(entry as SettingsEntryId) === id,
                ).length
              : changedCounts[id];

            return (
              <button
                key={id}
                type="button"
                aria-current={active === id}
                onClick={() =>
                  navigate({ name: "settings", section: id }, { replace: true })
                }
                className={cn(
                  "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
                  active === id
                    ? "bg-primary-soft text-foreground"
                    : "text-muted-foreground hover:bg-surface-3 hover:text-foreground",
                  isDimmed && "opacity-35",
                )}
              >
                <Icon className="size-4 shrink-0 text-faint" />
                <span className="min-w-0 flex-1 truncate text-left">
                  {t(`settings.sections.${id}`)}
                </span>
                {count > 0 && (
                  <span
                    className={cn(
                      "shrink-0 font-mono text-[0.65rem] tabular-nums",
                      isFiltering ? "text-faint" : "text-primary",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          <p className="mt-auto border-t border-border px-1.5 pt-2.5 text-[0.7rem] leading-snug text-faint">
            {t("settings.autosaveHint")}
          </p>
        </nav>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto pr-1 pb-1">
          {!sectionHasVisibleRows && isFiltering ? (
            <EmptySearch query={query} onClear={() => {
              setQuery("");
              setOnlyChanged(false);
            }} />
          ) : (
            <>
              {active === "game" && (
                <GameSection {...sectionProps} totalMemoryMb={totalMemoryMb} />
              )}
              {active === "downloads" && <DownloadsSection {...sectionProps} />}
              {active === "interface" && <InterfaceSection {...sectionProps} />}
              {active === "voice" && <VoiceSection {...sectionProps} />}
              {active === "privacy" && <PrivacySection {...sectionProps} />}
              {active === "storage" && (
                <StorageSection
                  onTotalChange={setStorageTotal}
                  visible={visible}
                  query={result.query}
                />
              )}
              {active === "about" && (
                <AboutSection
                  settings={settings}
                  appVersion={appVersion}
                  totalMemoryMb={totalMemoryMb}
                  storageTotal={storageTotal}
                  onShowWhatsNew={onShowWhatsNew}
                  visible={visible}
                  query={result.query}
                />
              )}
            </>
          )}
        </div>
      </div>

      <AlertDialog open={isResetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.resetAllConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.resetAllConfirmBody", { count: changedIds.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                setResetOpen(false);
                void commit(defaultsPatch(settings, changedIds));
              }}
            >
              <RotateCcw className="size-4" />
              {t("settings.resetAll")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SaveIndicator({ status }: { status: string }) {
  const { t } = useTranslation();

  if (status === "idle") return null;

  if (status === "failed") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive">
        <TriangleAlert className="size-3.5" />
        {t("settings.saveFailed")}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {status === "saving" ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Check className="size-3.5 text-success" />
      )}
      {status === "saving" ? t("settings.saving") : t("settings.saved")}
    </span>
  );
}

function EmptySearch({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <Search className="size-6 text-faint" />
      <p className="text-sm text-muted-foreground">
        {t("settings.search.empty", { query: query.trim() })}
      </p>
      <Button variant="outline" size="sm" onClick={onClear}>
        {t("settings.search.clear")}
      </Button>
    </div>
  );
}
