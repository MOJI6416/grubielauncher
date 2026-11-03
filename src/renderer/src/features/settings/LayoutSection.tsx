import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import {
  ArrowDown,
  ArrowUp,
  BookUser,
  LayoutGrid,
  LayoutTemplate,
  Lock,
  Newspaper,
  Play,
  Rows3,
  Rows4,
  Settings as LSettings,
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
import {
  DEFAULT_INTERFACE_LAYOUT,
  DOCK_LIMITS,
  type InstancesSort,
  type InstancesView,
  type InterfaceLayout,
  type TSettings,
} from "@/types/Settings";
import { Hint } from "@renderer/components/Hint";
import {
  instanceDockHiddenAtom,
  updateInstancesFile,
} from "@renderer/features/instances/instancesStore";
import {
  DEFAULT_TAB_CHOICES,
  HIDEABLE_TABS,
  HOME_BLOCKS,
  OVERVIEW_CARDS,
  SIDEBAR_SECTIONS,
  isNavFixed,
  isSlotHidden,
  moveNav,
  orderedNav,
  slotId,
  type NavSlot,
} from "@renderer/features/layout/layout";
import {
  startLayoutEditing,
  toggleSlot,
  updateLayout,
  useLayout,
} from "@renderer/features/layout/useLayout";
import { LayoutChip } from "@renderer/features/layout/LayoutChip";
import { PresetCards } from "@renderer/features/layout/PresetCards";
import { SettingRow, SettingsGroup, Segmented } from "./SettingsPrimitives";
import type { SettingsEntryId } from "./catalog";

const SORTS: InstancesSort[] = ["activity", "playtime", "name", "manual"];

const NAV_ICONS: Record<NavSlot, ReactNode> = {
  play: <Play className="size-4" />,
  people: <BookUser className="size-4" />,
  news: <Newspaper className="size-4" />,
  settings: <LSettings className="size-4" />,
};

const NAV_LABELS: Record<NavSlot, string> = {
  play: "nav.play",
  people: "shell.nav.people",
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

  return (
    <div className="mt-2.5 flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
      {order.map((slot, index) => {
        const fixed = isNavFixed(slot);
        const hidden = !fixed && isSlotHidden(layout, slotId.nav(slot));
        const label = t(NAV_LABELS[slot]);

        return (
          <div
            key={slot}
            className="flex h-9 items-center gap-2.5 bg-surface-2 px-2.5"
          >
            <span className="shrink-0 text-faint">{NAV_ICONS[slot]}</span>
            <span
              className={`min-w-0 flex-1 truncate text-sm ${hidden ? "text-faint" : "text-foreground"}`}
            >
              {label}
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={index === 0}
              aria-label={t("layout.moveUp", { name: label })}
              onClick={() => updateLayout((current) => moveNav(current, slot, -1))}
            >
              <ArrowUp />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={index === order.length - 1}
              aria-label={t("layout.moveDown", { name: label })}
              onClick={() => updateLayout((current) => moveNav(current, slot, 1))}
            >
              <ArrowDown />
            </Button>
            {fixed ? (
              <Hint content={t("layout.alwaysVisible")}>
                <span className="flex w-8 justify-center text-faint">
                  <Lock className="size-3.5" />
                </span>
              </Hint>
            ) : (
              <Switch
                checked={!hidden}
                aria-label={label}
                onCheckedChange={(value) => toggleSlot(slotId.nav(slot), !value)}
              />
            )}
          </div>
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

  const chips = (
    ids: { id: string; label: string; disabled?: boolean }[],
  ) => (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {ids.map(({ id, label, disabled }) => {
        const hidden = isSlotHidden(layout, id);
        return (
          <LayoutChip
            key={id}
            label={label}
            hidden={hidden}
            disabled={disabled}
            onToggle={() => toggleSlot(id, !hidden)}
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
            title={t("layout.presets.title")}
            description={t("layout.presets.description")}
            query={query}
          >
            <PresetCards settings={settings} />
          </SettingRow>
        )}

        {visible("layoutCustomize") && (
          <SettingRow
            title={t("layout.customize")}
            description={t("layout.customizeDescription")}
            query={query}
            changed={isChanged("layoutCustomize")}
            onReset={() => reset("layoutCustomize")}
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
      </SettingsGroup>

      <SettingsGroup title={t("layout.groups.sidebar")}>
        {visible("layoutSidebar") && (
          <SettingRow
            title={t("layout.sidebar.title")}
            description={t("layout.sidebar.description")}
            query={query}
            changed={layout.navOrder.length > 0 || hasPrefix(layout, "sidebar.")}
            onReset={() =>
              updateLayout((current) => ({
                ...clearPrefix(current, "sidebar."),
                navOrder: [],
              }))
            }
          >
            <NavOrderList layout={layout} />
            {chips(
              SIDEBAR_SECTIONS.map((section) => ({
                id: slotId.section(section),
                label: t(`layout.sidebar.${section}`),
              })),
            )}
          </SettingRow>
        )}

        {visible("layoutDock") && (
          <SettingRow
            title={t("layout.dock.title")}
            description={t("layout.dock.description")}
            query={query}
            changed={layout.dockLimit !== DEFAULT_INTERFACE_LAYOUT.dockLimit}
            onReset={() =>
              updateLayout((current) => ({
                ...current,
                dockLimit: DEFAULT_INTERFACE_LAYOUT.dockLimit,
              }))
            }
            control={
              <Segmented<string>
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
                  onClick={() =>
                    updateInstancesFile((file) => {
                      const next = { ...file };
                      delete next.dockHidden;
                      return next;
                    })
                  }
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
            title={t("settings.interface.instancesView")}
            description={t("settings.interface.instancesViewDescription")}
            query={query}
            changed={isChanged("instancesView")}
            onReset={() => reset("instancesView")}
            control={
              <div className="flex items-center gap-2">
                <Select
                  value={settings.instancesSort}
                  onValueChange={(value) =>
                    value && commit({ instancesSort: value as InstancesSort })
                  }
                >
                  <SelectTrigger size="sm" className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORTS.map((sort) => (
                      <SelectItem key={sort} value={sort}>
                        {t(`settings.interface.sorts.${sort}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Segmented<InstancesView>
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
            title={t("layout.home.rowTitle")}
            description={t("layout.home.description")}
            query={query}
            changed={hasPrefix(layout, "home.")}
            onReset={() => updateLayout((current) => clearPrefix(current, "home."))}
          >
            {chips(
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
            title={t("layout.instance.defaultTab")}
            description={t("layout.instance.defaultTabDescription")}
            query={query}
            changed={layout.instanceTab !== DEFAULT_INTERFACE_LAYOUT.instanceTab}
            onReset={() =>
              updateLayout((current) => ({
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
            title={t("layout.instance.tabs")}
            description={t("layout.instance.tabsDescription")}
            query={query}
            changed={hasPrefix(layout, "instance.tab.")}
            onReset={() =>
              updateLayout((current) => clearPrefix(current, "instance.tab."))
            }
          >
            {chips(
              HIDEABLE_TABS.map((tab) => ({
                id: slotId.tab(tab),
                label: t(`shell.tabs.${tab}`),
              })),
            )}
          </SettingRow>
        )}

        {visible("layoutOverview") && (
          <SettingRow
            title={t("layout.instance.overview")}
            description={t("layout.instance.overviewDescription")}
            query={query}
            changed={hasPrefix(layout, "overview.")}
            onReset={() => updateLayout((current) => clearPrefix(current, "overview."))}
          >
            {chips(
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
