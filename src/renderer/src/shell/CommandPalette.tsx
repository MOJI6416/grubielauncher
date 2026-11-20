import { ReactNode, useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  Bell,
  BookUser,
  Camera,
  Boxes,
  ChartArea,
  CornerDownLeft,
  FileCog,
  Folder,
  Info,
  LayoutTemplate,
  ListPlus,
  MonitorPlay,
  PackageOpen,
  Paintbrush,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RotateCcw,
  ScrollText,
  Search,
  Server,
  ServerCog,
  Settings as LSettings,
  SlidersHorizontal,
  Sparkles,
  TreePine,
  UserRound,
  Users,
  Wifi,
  SquareTerminal,
  SquareSplitHorizontal,
  TriangleAlert,
} from "lucide-react";
import {
  accountAtom,
  accountsAtom,
  isRunningAtom,
  selectedVersionAtom,
  settingsAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useFocusReturn } from "@/components/ui/focus-return";
import { AccountHead } from "@renderer/features/accounts/AccountHead";
import { providerName } from "@renderer/features/accounts/ProviderMark";
import { accountIdentity } from "@renderer/features/accounts/identity";
import { switchAccount } from "@renderer/features/accounts/switchAccount";
import {
  SETTINGS_ENTRIES,
  SETTINGS_SECTIONS,
  isEntryAvailable,
} from "@renderer/features/settings/catalog";
import { openSettingsEntry } from "@renderer/features/settings/settingsFocus";
import { PLATFORM } from "@renderer/utilities/platform";
import { navigate } from "@renderer/navigation/navigate";
import {
  agentBlockReason,
  blockReasonShortKey,
  routeBlockReason,
} from "@renderer/navigation/access";
import { Hint } from "@renderer/components/Hint";
import { showFailureToast } from "@renderer/utilities/failures";
import { openNewInstance } from "@renderer/features/instances/newInstance";
import { openConnectivityCheck } from "@renderer/features/install/installUi";
import { openErrorLog } from "@renderer/features/logs/openErrorLog";
import { OWN_PROFILE_ID } from "@renderer/features/profile/loadProfileUser";
import { instanceKey } from "@renderer/features/instances/selectors";
import { getLoaderInfo } from "@renderer/components/Loaders";
import { askAgent, openAgent } from "@renderer/features/agent/openAgent";
import {
  setStreamerMode,
  useStreamerState,
} from "@renderer/features/streamer/streamerMode";
import type { InstanceTab } from "@renderer/navigation/routes";
import type { RunGameParams } from "@renderer/features/launch/types";
import {
  groupBySection,
  matchRanges,
  parsePaletteQuery,
  rankCommands,
  type PaletteSection,
  type Rankable,
} from "./commands";
import { readPaletteUsage, recordPaletteUse } from "./paletteUsage";
import { AGENT_SHORTCUT_LABEL, SIDEBAR_SHORTCUT_LABEL } from "./shortcuts";
import { toggleSidebar } from "./sidebarCollapse";
import { isLayoutCustomized } from "@renderer/features/layout/layout";
import {
  applyPreset,
  resetLayout,
  startLayoutEditing,
} from "@renderer/features/layout/useLayout";
import { LAYOUT_PRESETS, matchPreset } from "@renderer/features/layout/presets";
import { BUILT_IN_THEMES } from "@/shared/themes";
import { userThemesAtom } from "@renderer/features/theme/themesStore";
import { themeName } from "@renderer/features/theme/ThemeCard";
import { patchSettings } from "@renderer/utilities/persistSettings";

const api = window.api;

const INSTANCE_TABS: InstanceTab[] = [
  "overview",
  "modpack",
  "content",
  "worlds",
  "servers",
  "server",
  "configs",
  "settings",
  "arguments",
  "statistics",
  "logs",
];

const PALETTE_PREFIXES = [
  { prefix: ">", mode: "actions" },
  { prefix: "@", mode: "instances" },
  { prefix: "#", mode: "settings" },
  { prefix: "?", mode: "help" },
] as const;

const TAB_ICON: Record<InstanceTab, ReactNode> = {
  overview: <Info className="size-4 text-faint" />,
  modpack: <PackageOpen className="size-4 text-faint" />,
  content: <Boxes className="size-4 text-faint" />,
  worlds: <TreePine className="size-4 text-faint" />,
  servers: <Server className="size-4 text-faint" />,
  server: <ServerCog className="size-4 text-faint" />,
  configs: <FileCog className="size-4 text-faint" />,
  settings: <LSettings className="size-4 text-faint" />,
  arguments: <SquareTerminal className="size-4 text-faint" />,
  statistics: <ChartArea className="size-4 text-faint" />,
  logs: <ScrollText className="size-4 text-faint" />,
  bisect: <SquareSplitHorizontal className="size-4 text-faint" />,
};

type PaletteItem = Rankable & {
  icon: ReactNode;
  hint?: string;
  run: () => void;
};

const ITEM_CLASS =
  "flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted-foreground data-[selected=true]:bg-primary-soft-raised data-[selected=true]:text-foreground aria-disabled:opacity-50";

const GROUP_CLASS =
  "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-3xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-[0.09em] [&_[cmdk-group-heading]]:text-faint [&_[cmdk-group-heading]]:uppercase";

function Highlight({ text, query }: { text: string; query: string }) {
  const ranges = useMemo(() => matchRanges(text, query), [text, query]);
  if (ranges.length === 0) return <>{text}</>;

  const parts: ReactNode[] = [];
  let cursor = 0;

  ranges.forEach(([start, end], index) => {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark key={index} className="bg-transparent text-primary">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });

  if (cursor < text.length) parts.push(text.slice(cursor));

  return <>{parts}</>;
}

export function CommandPalette({
  open,
  onOpenChange,
  initialQuery,
  runGame,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery: string;
  runGame: (params: RunGameParams) => Promise<void>;
}) {
  const versions = useAtomValue(versionsAtom);
  const account = useAtomValue(accountAtom);
  const accounts = useAtomValue(accountsAtom);
  const isRunning = useAtomValue(isRunningAtom);
  const selected = useAtomValue(selectedVersionAtom);
  const [raw, setRaw] = useState(initialQuery);
  const streamer = useStreamerState();
  const settings = useAtomValue(settingsAtom);
  const userThemes = useAtomValue(userThemesAtom);
  const { t, i18n } = useTranslation();

  useFocusReturn(open);

  useEffect(() => {
    if (open) setRaw(initialQuery);
  }, [initialQuery, open]);

  const usage = useMemo(() => (open ? readPaletteUsage() : {}), [open]);

  const selectedIdentity = account ? accountIdentity(account) : null;
  const agentBlocked = agentBlockReason(account?.type);
  const isAgentBlocked = agentBlocked !== null;
  const onlineBlocked = routeBlockReason(
    { name: "people" },
    { accountType: account?.type ?? null },
  );
  const onlineHint = onlineBlocked ? t(blockReasonShortKey(onlineBlocked)) : undefined;
  const runningHint = isRunning ? t("shell.palette.blockedRunning") : undefined;

  const items = useMemo<PaletteItem[]>(() => {
    if (!open) return [];

    const english = i18n.getFixedT("en");
    const words = (key: string) =>
      `${t(`shell.palette.keywords.${key}`)} ${english(`shell.palette.keywords.${key}`)}`;

    const list: PaletteItem[] = [
      {
        id: "nav:home",
        section: "navigate",
        title: t("nav.play"),
        keywords: words("home"),
        icon: <Play className="size-4 text-faint" />,
        run: () => navigate({ name: "home" }),
      },
      {
        id: "nav:agent",
        section: "navigate",
        title: t("agent.title"),
        hint: agentBlocked
          ? t(blockReasonShortKey(agentBlocked))
          : AGENT_SHORTCUT_LABEL,
        keywords: words("agent"),
        icon: <Sparkles className="size-4 text-faint" />,
        disabled: isAgentBlocked,
        run: () => openAgent(),
      },
      {
        id: "nav:people",
        section: "navigate",
        title: t("shell.nav.people"),
        keywords: words("people"),
        hint: onlineHint,
        icon: <BookUser className="size-4 text-faint" />,
        disabled: !account || account.type === "plain",
        run: () => navigate({ name: "people" }),
      },
      {
        id: "nav:profile",
        section: "navigate",
        title: t("shell.nav.profile"),
        keywords: words("profile"),
        hint: onlineHint,
        icon: <UserRound className="size-4 text-faint" />,
        disabled: !account || account.type === "plain",
        run: () => navigate({ name: "profile", userId: OWN_PROFILE_ID }),
      },
      {
        id: "nav:notifications",
        section: "navigate",
        title: t("shell.palette.notifications"),
        keywords: words("notifications"),
        hint: onlineHint ?? t("shell.palette.inProfile"),
        icon: <Bell className="size-4 text-faint" />,
        disabled: !account || account.type === "plain",
        run: () =>
          navigate({ name: "profile", userId: OWN_PROFILE_ID, tab: "profile" }),
      },
      {
        id: "nav:screenshots",
        section: "navigate",
        title: t("versions.screenshots.title"),
        keywords: words("screenshots"),
        icon: <Camera className="size-4 text-faint" />,
        run: () => navigate({ name: "screenshots" }),
      },
      {
        id: "nav:settings",
        section: "navigate",
        title: t("settings.title"),
        keywords: words("settings"),
        icon: <LSettings className="size-4 text-faint" />,
        run: () => navigate({ name: "settings" }),
      },
      {
        id: "nav:accounts",
        section: "navigate",
        title: t("accounts.manage"),
        keywords: words("accounts"),
        icon: <Users className="size-4 text-faint" />,
        run: () => navigate({ name: "accounts" }),
      },
      {
        id: "action:new-instance",
        section: "actions",
        title: t("shell.nav.newInstance"),
        keywords: words("newInstance"),
        hint: runningHint,
        icon: <ListPlus className="size-4 text-faint" />,
        disabled: isRunning,
        run: () => openNewInstance(),
      },
      {
        id: "action:connectivity",
        section: "actions",
        title: t("taskCenter.checkConnection"),
        keywords: words("connectivity"),
        icon: <Wifi className="size-4 text-faint" />,
        run: () => openConnectivityCheck(),
      },
      {
        id: "action:error-log",
        section: "actions",
        title: t("errorLog.title"),
        keywords: words("errorLog"),
        icon: <TriangleAlert className="size-4 text-faint" />,
        run: () => openErrorLog(),
      },
      {
        id: "action:streamer-mode",
        section: "actions",
        title: streamer.active
          ? t("streamer.commandOff")
          : t("streamer.commandOn"),
        keywords: words("streamer"),
        icon: <MonitorPlay className="size-4 text-faint" />,
        run: () => void setStreamerMode(!streamer.active),
      },
      {
        id: "action:toggle-sidebar",
        section: "actions",
        title: settings.sidebarCollapsed
          ? t("shell.sidebarExpand")
          : t("shell.sidebarCollapse"),
        hint: SIDEBAR_SHORTCUT_LABEL,
        keywords: words("sidebar"),
        icon: settings.sidebarCollapsed ? (
          <PanelLeftOpen className="size-4 text-faint" />
        ) : (
          <PanelLeftClose className="size-4 text-faint" />
        ),
        run: toggleSidebar,
      },
      {
        id: "action:customize-layout",
        section: "actions",
        title: t("layout.customize"),
        keywords: words("customizeLayout"),
        icon: <LayoutTemplate className="size-4 text-faint" />,
        run: startLayoutEditing,
      },
      {
        id: "action:reset-layout",
        section: "actions",
        title: t("layout.reset"),
        keywords: words("resetLayout"),
        icon: <RotateCcw className="size-4 text-faint" />,
        disabled: !isLayoutCustomized(settings.interface),
        hint: isLayoutCustomized(settings.interface)
          ? undefined
          : t("shell.palette.reasons.layoutDefault"),
        run: resetLayout,
      },
      ...LAYOUT_PRESETS.map((id) => ({
        id: `action:layout-preset-${id}`,
        section: "actions" as const,
        title: t("layout.presets.command", {
          name: t(`layout.presets.${id}.title`),
        }),
        keywords: words("layoutPreset"),
        icon: <LayoutTemplate className="size-4 text-faint" />,
        disabled: matchPreset(settings) === id,
        hint:
          matchPreset(settings) === id
            ? t("shell.palette.reasons.current")
            : undefined,
        run: () => applyPreset(id),
      })),
      ...[...BUILT_IN_THEMES, ...userThemes].map((theme) => ({
        id: `action:theme-${theme.id}`,
        section: "actions" as const,
        title: t("theme.command", { name: themeName(theme, t) }),
        keywords: words("theme"),
        icon: <Paintbrush className="size-4 text-faint" />,
        disabled: settings.themeId === theme.id,
        hint:
          settings.themeId === theme.id
            ? t("shell.palette.reasons.current")
            : undefined,
        run: () =>
          void patchSettings({ themeId: theme.id }).catch((error) =>
            showFailureToast(t("settings.saveFailed"), error, {
              channels: ["fs:writeJSON"],
            }),
          ),
      })),
    ];

    if (selected) {
      const key = instanceKey(selected);

      list.push({
        id: "action:open-folder",
        section: "actions",
        title: t("common.openFolder"),
        hint: selected.version.name,
        keywords: `${words("openFolder")} ${selected.version.name}`,
        icon: <Folder className="size-4 text-faint" />,
        run: () => void api.shell.openPath(selected.versionPath),
      });

      for (const tab of INSTANCE_TABS) {
        if (tab === "modpack" && !selected.version.modpack) continue;
        list.push({
          id: `tab:${tab}`,
          section: "actions",
          title: t(`shell.tabs.${tab}`),
          hint: selected.version.name,
          keywords: `${words(`tabs.${tab}`)} ${selected.version.name}`,
          icon: TAB_ICON[tab],
          run: () => navigate({ name: "instance", id: key, tab }),
        });
      }
    }

    for (const version of versions) {
      const key = instanceKey(version);
      const loader = getLoaderInfo(version.version.loader.name);
      const canPlay = Boolean(account) && !isRunning && version.hasManifest;

      list.push({
        id: `instance:${key}`,
        section: "instances",
        title: version.version.name,
        hint: version.version.version.id,
        keywords: `${loader.name} ${version.version.version.id}`,
        icon: <span className={`size-2 shrink-0 rounded-full ${loader.dot}`} />,
        run: () => navigate({ name: "instance", id: key }),
      });

      if (canPlay) {
        list.push({
          id: `play:${key}`,
          section: "actions",
          title: t("versions.playInstance", { name: version.version.name }),
          hint: version.version.version.id,
          keywords: `${words("play")} ${loader.name}`,
          icon: <Play className="size-4 text-success" />,
          run: () => void runGame({ version }),
        });
      }
    }

    for (const entry of accounts) {
      const identity = accountIdentity(entry);
      if (identity === selectedIdentity) continue;

      list.push({
        id: `account:${identity}`,
        section: "accounts",
        title: entry.nickname,
        hint: providerName(entry.type, t),
        keywords: `${words("account")} ${entry.type}`,
        icon: <AccountHead account={entry} size={18} />,
        run: () => void switchAccount(entry),
      });
    }

    if (!isAgentBlocked) {
      list.push({
        id: "action:agent-chat",
        section: "agent",
        title: t("agent.newChat"),
        keywords: words("agentChat"),
        icon: <Sparkles className="size-4 text-faint" />,
        run: () => askAgent(),
      });
    }

    for (const section of SETTINGS_SECTIONS) {
      const entryWords = SETTINGS_ENTRIES.filter(
        (entry) => entry.section === section,
      )
        .map(
          (entry) =>
            `${t(`settings.index.${entry.id}.title`)} ${t(`settings.index.${entry.id}.keywords`)}`,
        )
        .join(" ");

      list.push({
        id: `settings:${section}`,
        section: "settings",
        title: t(`settings.sections.${section}`),
        keywords: `${words("settings")} ${section} ${entryWords}`,
        icon: <LSettings className="size-4 text-faint" />,
        run: () => navigate({ name: "settings", section }),
      });
    }

    for (const entry of SETTINGS_ENTRIES) {
      if (!isEntryAvailable(entry, PLATFORM)) continue;
      const key = `settings.index.${entry.id}`;

      list.push({
        id: `setting:${entry.id}`,
        section: "settings",
        title: t(`${key}.title`),
        hint: t(`settings.sections.${entry.section}`),
        keywords: [
          t(`${key}.keywords`),
          t(`${key}.description`),
          english(`${key}.title`),
          english(`${key}.keywords`),
        ].join(" "),
        icon: <SlidersHorizontal className="size-4 text-faint" />,
        run: () => void openSettingsEntry(entry.id),
      });
    }

    return list;
  }, [
    account,
    accounts,
    agentBlocked,
    i18n,
    isAgentBlocked,
    isRunning,
    onlineHint,
    runningHint,
    open,
    runGame,
    selected,
    selectedIdentity,
    settings,
    userThemes,
    streamer.active,
    t,
    versions,
  ]);

  const { mode, query } = parsePaletteQuery(raw);

  const ranked = useMemo(
    () => rankCommands(items, raw, usage),
    [items, raw, usage],
  );

  const groups = useMemo(() => groupBySection(ranked), [ranked]);

  const sectionTitle = (section: PaletteSection): string =>
    t(`shell.palette.sections.${section}`);

  const close = () => onOpenChange(false);

  const pick = (item: PaletteItem) => {
    recordPaletteUse(item.id);
    close();
    item.run();
  };

  const askItem =
    !isAgentBlocked &&
    query.trim().length >= 2 &&
    (mode === "all" || mode === "actions") ? (
      <Command.Item
        value="__ask-agent"
        className={ITEM_CLASS}
        onSelect={() => {
          close();
          askAgent(query.trim());
        }}
      >
        <Sparkles className="size-4 text-faint" />
        <Hint
          content={t("shell.palette.askAgent", { query: query.trim() })}
          variant="text"
          truncatedOnly
        >
          <span className="min-w-0 flex-1 truncate">
            {t("shell.palette.askAgent", { query: query.trim() })}
          </span>
        </Hint>
      </Command.Item>
    ) : null;

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label={t("shell.palette.label")}
      shouldFilter={false}
      loop
      className="flex max-h-[28rem] flex-col"
      overlayClassName="fixed inset-0 z-50 bg-scrim supports-backdrop-filter:backdrop-blur-xs"
      contentClassName="fixed top-20 left-1/2 z-50 w-[38rem] -translate-x-1/2 overflow-hidden rounded-2xl border border-input bg-popover shadow-2xl"
    >
      <DialogTitle className="sr-only">{t("shell.palette.label")}</DialogTitle>
      <DialogDescription className="sr-only">
        {t("shell.palette.description")}
      </DialogDescription>

      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3.5">
        <Search className="size-4 shrink-0 text-faint" />
        {mode !== "all" && (
          <span className="shrink-0 rounded-md bg-primary-soft-raised px-1.5 py-0.5 text-xs text-foreground">
            {t(`shell.palette.modes.${mode}`)}
          </span>
        )}
        <Command.Input
          autoFocus
          value={raw}
          onValueChange={setRaw}
          placeholder={t("shell.palette.placeholder")}
          className="h-12 min-w-0 flex-1 bg-transparent text-[0.95rem] text-foreground outline-none placeholder:text-faint"
        />
      </div>

      <Command.List className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {mode === "help" ? (
          <div className="space-y-1 p-2">
            {PALETTE_PREFIXES.filter((item) => item.mode !== "help").map(
              ({ prefix, mode: prefixMode }) => (
                <button
                  key={prefix}
                  type="button"
                  onClick={() => setRaw(prefix)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-1 py-0.5 text-left text-sm transition-colors hover:bg-row-hover"
                >
                  <kbd className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 font-mono text-xs text-muted-foreground">
                    {prefix}
                  </kbd>
                  <span className="text-muted-foreground">
                    {t(`shell.palette.modes.${prefixMode}`)}
                  </span>
                </button>
              ),
            )}
          </div>
        ) : (
          <>
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
              {askItem ? null : t("common.notFound")}
            </Command.Empty>

            {groups.map((group) => (
              <Command.Group
                key={group.section}
                heading={sectionTitle(group.section)}
                className={GROUP_CLASS}
              >
                {group.commands.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={item.id}
                    disabled={item.disabled}
                    className={ITEM_CLASS}
                    onSelect={() => pick(item as PaletteItem)}
                  >
                    {(item as PaletteItem).icon}
                    <Hint content={item.title} variant="text" truncatedOnly>
                      <span className="min-w-0 flex-1 truncate">
                        <Highlight text={item.title} query={query} />
                      </span>
                    </Hint>
                    {(item as PaletteItem).hint && (
                      <Hint
                        content={(item as PaletteItem).hint}
                        variant="text"
                        truncatedOnly
                      >
                        <span className="max-w-48 shrink-0 truncate font-mono text-2xs text-faint">
                          {(item as PaletteItem).hint}
                        </span>
                      </Hint>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}

            {askItem && (
              <Command.Group
                heading={sectionTitle("agent")}
                className={GROUP_CLASS}
              >
                {askItem}
              </Command.Group>
            )}
          </>
        )}
      </Command.List>

      <div className="flex h-8 shrink-0 items-center gap-3 border-t border-border px-3 text-3xs text-faint">
        <span className="flex items-center gap-1">
          <CornerDownLeft className="size-3" />
          {t("shell.palette.open")}
        </span>
        {PALETTE_PREFIXES.map(({ prefix, mode: prefixMode }) => (
          <button
            key={prefix}
            type="button"
            onClick={() => setRaw(prefix)}
            className="flex items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <kbd className="font-mono text-2xs">{prefix}</kbd>
            {t(`shell.palette.modes.${prefixMode}`)}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1">
          <kbd className="font-mono">Esc</kbd>
          {t("common.close")}
        </span>
      </div>
    </Command.Dialog>
  );
}
