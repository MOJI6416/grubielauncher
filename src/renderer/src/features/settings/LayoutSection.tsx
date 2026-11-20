import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import {
  BookUser,
  Camera,
  LayoutGrid,
  LayoutTemplate,
  Lock,
  Newspaper,
  Play,
  Rows3,
  Rows4,
  Settings as LSettings,
  Shirt,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SegmentedControl } from "@renderer/components/SegmentedControl";
import { SortMenu } from "@renderer/components/SortMenu";
import {
  DEFAULT_INTERFACE_LAYOUT,
  DOCK_LIMITS,
  type InstancesSort,
  type InstancesView,
  type InterfaceLayout,
  type TSettings,
} from "@/types/Settings";
import { Hint } from "@renderer/components/Hint";
import { instanceDockHiddenAtom } from "@renderer/features/instances/instancesStore";
import {
  DEFAULT_TAB_CHOICES,
  HIDEABLE_TABS,
  HOME_BLOCKS,
  OVERVIEW_CARDS,
  SIDEBAR_SECTIONS,
  isNavFixed,
  isSlotHidden,
  orderedNav,
  slotId,
  type NavSlot,
} from "@renderer/features/layout/layout";
import {
  resetLayout,
  resetLayoutPart,
  setSlotVisible,
  showWholeDock,
  startLayoutEditing,
  updateLayout,
  useLayout,
} from "@renderer/features/layout/useLayout";
import { SlotItem } from "@renderer/features/layout/SlotItem";
import { ReorderHandle, useNavDrag } from "@renderer/features/layout/ReorderHandle";
import { PresetCards } from "@renderer/features/layout/PresetCards";
import { SettingRow, SettingsGroup } from "./SettingsPrimitives";
import type { SettingsEntryId } from "./catalog";

const SORTS: InstancesSort[] = ["activity", "playtime", "name", "manual"];

const NAV_ICONS: Record<NavSlot, ReactNode> = {
  play: <Play className="size-4" />,
  people: <BookUser className="size-4" />,
  wardrobe: <Shirt className="size-4" />,
  screenshots: <Camera className="size-4" />,
  news: <Newspaper className="size-4" />,
  settings: <LSettings className="size-4" />,
};

const NAV_LABELS: Record<NavSlot, string> = {
  play: "nav.play",
  people: "shell.nav.people",
  wardrobe: "shell.nav.wardrobe",
  screenshots: "versions.screenshots.title",
  news: "news.title",
  settings: "settings.title",
};

function hasPrefix(layout: InterfaceLayout, prefix: string): boolean {
  return layout.hidden.some((id) => id.startsWith(prefix));
}

function clearPrefix(layout: InterfaceLayout, prefix: string): InterfaceLayout {
  return {
    ...layout,
    hidden: layout.hidden.filter((id) => !id.startsWith(prefix)),
  };
}

function NavOrderList({ layout }: { layout: InterfaceLayout }) {
  const { t } = useTranslation();
  const order = orderedNav(layout);
  const dragProps = useNavDrag();

  return (
    <div className="mt-2.5 flex flex-col gap-1">
      {order.map((slot, index) => {
        const fixed = isNavFixed(slot);
        const id = slotId.nav(slot);
        const hidden = !fixed && isSlotHidden(layout, id);
        const label = t(NAV_LABELS[slot]);

        return (
          <SlotItem
            key={slot}
            {...dragProps(slot)}
            className="pl-1"
            label={label}
            hidden={hidden}
            icon={NAV_ICONS[slot]}
            lead={
              <ReorderHandle slot={slot} label={label} index={index} count={order.length} />
            }
            onToggle={fixed ? undefined : () => setSlotVisible(id, label, hidden)}
            trail={
              fixed ? (
                <Hint content={t("layout.alwaysVisible")}>
                  <span
                    aria-label={t("layout.alwaysVisible")}
                    className="flex size-6 shrink-0 items-center justify-center text-faint"
                  >
                    <Lock className="size-3.5" />
                  </span>
                </Hint>
              ) : undefined
            }
          />
        );
      })}
    </div>
  );
}

export function LayoutSection({
  settings,
  commit,
  visible,
  query,
  isChanged,
  reset,
}: {
  settings: TSettings;
  commit: (patch: Partial<TSettings>) => void;
  visible: (id: SettingsEntryId) => boolean;
  query: string;
  isChanged: (id: SettingsEntryId) => boolean;
  reset: (id: SettingsEntryId) => void;
}) {
  const { t } = useTranslation();
  const layout = useLayout();
  const dockHidden = useAtomValue(instanceDockHiddenAtom);
  const isHeroHidden = isSlotHidden(layout, slotId.home("hero"));

  const slots = (
    ids: { id: string; label: string; disabled?: boolean }[],
  ) => (
    <div className="mt-2.5 grid grid-cols-3 gap-1.5">
      {ids.map(({ id, label, disabled }) => {
        const hidden = isSlotHidden(layout, id);
        return (
          <SlotItem
            key={id}
            label={label}
            hidden={hidden}
            disabled={disabled}
            disabledReason={t("layout.home.needsHero")}
            onToggle={() => setSlotVisible(id, label, hidden)}
          />
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <SettingsGroup title={t("settings.sections.layout")}>
        {visible("layoutPresets") && (
          <SettingRow
            entry="layoutPresets"
            title={t("layout.presets.title")}
            description={t("layout.presets.description")}
            query={query}
          >
            <PresetCards settings={settings} />
          </SettingRow>
        )}

        {visible("layoutCustomize") && (
          <SettingRow
            entry="layoutCustomize"
            title={t("layout.customize")}
            description={t("layout.customizeDescription")}
            query={query}
            changed={isChanged("layoutCustomize")}
            onReset={resetLayout}
            control={
              <Button variant="secondary" size="sm" onClick={startLayoutEditing}>
                <LayoutTemplate />
                {t("layout.customizeAction")}
              </Button>
            }
          />
        )}

        {visible("sidebarCollapsed") && (
          <SettingRow
            entry="sidebarCollapsed"
            htmlFor="settings-sidebarCollapsed"
            title={t("settings.interface.sidebarCollapsed")}
            description={t("settings.interface.sidebarCollapsedDescription")}
            query={query}
            changed={isChanged("sidebarCollapsed")}
            onReset={() => reset("sidebarCollapsed")}
            control={
              <Switch
                id="settings-sidebarCollapsed"
                checked={settings.sidebarCollapsed}
                onCheckedChange={(value) => commit({ sidebarCollapsed: value })}
              />
            }
          />
        )}

        {visible("ambientTint") && (
          <SettingRow
            entry="ambientTint"
            htmlFor="settings-ambientTint"
            title={t("settings.interface.ambientTint")}
            description={t("settings.interface.ambientTintDescription")}
            query={query}
            changed={isChanged("ambientTint")}
            onReset={() => reset("ambientTint")}
            control={
              <Switch
                id="settings-ambientTint"
                checked={settings.ambientTint}
                onCheckedChange={(value) => commit({ ambientTint: value })}
              />
            }
          />
        )}

        {visible("backgroundGrain") && (
          <SettingRow
            entry="backgroundGrain"
            htmlFor="settings-backgroundGrain"
            title={t("settings.interface.backgroundGrain")}
            description={t("settings.interface.backgroundGrainDescription")}
            query={query}
            changed={isChanged("backgroundGrain")}
            onReset={() => reset("backgroundGrain")}
            control={
              <Switch
                id="settings-backgroundGrain"
                checked={settings.backgroundGrain}
                onCheckedChange={(value) => commit({ backgroundGrain: value })}
              />
            }
          />
        )}
      </SettingsGroup>

      <SettingsGroup title={t("layout.groups.sidebar")}>
        {visible("layoutSidebar") && (
          <SettingRow
            entry="layoutSidebar"
            title={t("layout.sidebar.title")}
            description={t("layout.sidebar.description")}
            query={query}
            changed={layout.navOrder.length > 0 || hasPrefix(layout, "sidebar.")}
            onReset={() =>
              resetLayoutPart(t("layout.sidebar.title"), (current) => ({
                ...clearPrefix(current, "sidebar."),
                navOrder: [],
              }))
            }
          >
            <NavOrderList layout={layout} />
            {slots(
              SIDEBAR_SECTIONS.map((section) => ({
                id: slotId.section(section),
                label: t(`layout.sidebar.${section}`),
              })),
            )}
          </SettingRow>
        )}

        {visible("layoutDock") && (
          <SettingRow
            entry="layoutDock"
            title={t("layout.dock.title")}
            description={t("layout.dock.description")}
            query={query}
            changed={layout.dockLimit !== DEFAULT_INTERFACE_LAYOUT.dockLimit}
            onReset={() =>
              resetLayoutPart(t("layout.dock.title"), (current) => ({
                ...current,
                dockLimit: DEFAULT_INTERFACE_LAYOUT.dockLimit,
              }))
            }
            control={
              <SegmentedControl<string>
                ariaLabel={t("layout.dock.title")}
                value={String(layout.dockLimit)}
                onChange={(value) =>
                  updateLayout((current) => ({
                    ...current,
                    dockLimit: Number(value),
                  }))
                }
                options={DOCK_LIMITS.map((limit) => ({
                  value: String(limit),
                  label: limit === 0 ? t("layout.dock.all") : String(limit),
                }))}
              />
            }
          >
            {dockHidden.length > 0 && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{t("layout.dock.hiddenCount", { count: dockHidden.length })}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={showWholeDock}
                >
                  {t("layout.dock.showAll")}
                </Button>
              </div>
            )}
          </SettingRow>
        )}
      </SettingsGroup>

      <SettingsGroup title={t("layout.groups.home")}>
        {visible("instancesView") && (
          <SettingRow
            entry="instancesView"
            title={t("settings.interface.instancesView")}
            description={t("settings.interface.instancesViewDescription")}
            query={query}
            changed={isChanged("instancesView")}
            onReset={() => reset("instancesView")}
            control={
              <div className="flex items-center gap-2">
                <SortMenu<InstancesSort>
                  value={settings.instancesSort}
                  options={SORTS.map((sort) => ({
                    value: sort,
                    label: t(`settings.interface.sorts.${sort}`),
                  }))}
                  onChange={(value) => commit({ instancesSort: value })}
                />
                <SegmentedControl<InstancesView>
                  ariaLabel={t("settings.interface.instancesView")}
                  value={settings.instancesView}
                  onChange={(value) => commit({ instancesView: value })}
                  options={[
                    {
                      value: "list",
                      label: t("settings.interface.viewList"),
                      icon: <Rows3 className="size-3.5" />,
                    },
                    {
                      value: "compact",
                      label: t("settings.interface.viewCompact"),
                      icon: <Rows4 className="size-3.5" />,
                    },
                    {
                      value: "grid",
                      label: t("settings.interface.viewGrid"),
                      icon: <LayoutGrid className="size-3.5" />,
                    },
                  ]}
                />
              </div>
            }
          />
        )}

        {visible("layoutHome") && (
          <SettingRow
            entry="layoutHome"
            title={t("layout.home.rowTitle")}
            description={t("layout.home.description")}
            query={query}
            changed={hasPrefix(layout, "home.")}
            onReset={() =>
              resetLayoutPart(t("layout.home.rowTitle"), (current) =>
                clearPrefix(current, "home."),
              )
            }
          >
            {slots(
              HOME_BLOCKS.map((block) => ({
                id: slotId.home(block),
                label: t(`layout.home.${block}`),
                disabled: block !== "hero" && isHeroHidden,
              })),
            )}
          </SettingRow>
        )}
      </SettingsGroup>

      <SettingsGroup title={t("layout.groups.instance")}>
        {visible("layoutInstanceTab") && (
          <SettingRow
            entry="layoutInstanceTab"
            title={t("layout.instance.defaultTab")}
            description={t("layout.instance.defaultTabDescription")}
            query={query}
            changed={layout.instanceTab !== DEFAULT_INTERFACE_LAYOUT.instanceTab}
            onReset={() =>
              resetLayoutPart(t("layout.instance.defaultTab"), (current) => ({
                ...current,
                instanceTab: DEFAULT_INTERFACE_LAYOUT.instanceTab,
              }))
            }
            control={
              <Select
                value={layout.instanceTab}
                onValueChange={(value) =>
                  value &&
                  updateLayout((current) => ({ ...current, instanceTab: value }))
                }
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_TAB_CHOICES.map((tab) => (
                    <SelectItem key={tab} value={tab}>
                      {t(`shell.tabs.${tab}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
        )}

        {visible("layoutTabs") && (
          <SettingRow
            entry="layoutTabs"
            title={t("layout.instance.tabs")}
            description={t("layout.instance.tabsDescription")}
            query={query}
            changed={hasPrefix(layout, "instance.tab.")}
            onReset={() =>
              resetLayoutPart(t("layout.instance.tabs"), (current) =>
                clearPrefix(current, "instance.tab."),
              )
            }
          >
            {slots(
              HIDEABLE_TABS.map((tab) => ({
                id: slotId.tab(tab),
                label: t(`shell.tabs.${tab}`),
              })),
            )}
          </SettingRow>
        )}

        {visible("layoutOverview") && (
          <SettingRow
            entry="layoutOverview"
            title={t("layout.instance.overview")}
            description={t("layout.instance.overviewDescription")}
            query={query}
            changed={hasPrefix(layout, "overview.")}
            onReset={() =>
              resetLayoutPart(t("layout.instance.overview"), (current) =>
                clearPrefix(current, "overview."),
              )
            }
          >
            {slots(
              OVERVIEW_CARDS.map((card) => ({
                id: slotId.card(card),
                label: t(`layout.overview.${card}`),
              })),
            )}
          </SettingRow>
        )}
      </SettingsGroup>
    </div>
  );
}
