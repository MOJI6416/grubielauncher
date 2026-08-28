import { ReactNode, useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  AtSign,
  BookUser,
  Boxes,
  ChartArea,
  CornerDownLeft,
  FileCog,
  Folder,
  Hash,
  Info,
  ListPlus,
  Play,
  ScrollText,
  Search,
  Server,
  ServerCog,
  Settings as LSettings,
  Sparkles,
  TreePine,
  UserRound,
  Users,
} from "lucide-react";
import {
  accountAtom,
  accountsAtom,
  isRunningAtom,
  selectedVersionAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { DialogTitle } from "@/components/ui/dialog";
import { useFocusReturn } from "@/components/ui/focus-return";
import { AccountHead } from "@renderer/features/accounts/AccountHead";
import { providerName } from "@renderer/features/accounts/ProviderMark";
import { accountIdentity } from "@renderer/features/accounts/identity";
import { switchAccount } from "@renderer/features/accounts/switchAccount";
import {
  SETTINGS_ENTRIES,
  SETTINGS_SECTIONS,
} from "@renderer/features/settings/catalog";
import { navigate } from "@renderer/navigation/navigate";
import {
  agentBlockReason,
  blockReasonShortKey,
} from "@renderer/navigation/access";
import { openNewInstance } from "@renderer/features/instances/newInstance";
import { OWN_PROFILE_ID } from "@renderer/features/profile/loadProfileUser";
import { instanceKey } from "@renderer/features/instances/selectors";
import { getLoaderInfo } from "@renderer/components/Loaders";
import { askAgent, openAgent } from "@renderer/features/agent/openAgent";
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
import { AGENT_SHORTCUT_LABEL } from "./shortcuts";

const api = window.api;

const INSTANCE_TABS: InstanceTab[] = [
  "overview",
  "content",
  "worlds",
  "servers",
  "server",
  "configs",
  "settings",
  "statistics",
  "logs",
];

const INSTANCE_TAB_KEYWORDS: Record<InstanceTab, string> = {
  overview:
    "overview publish share overview обзор огляд публикация опубликовать поделиться ярлык публікація",
  content:
    "content mods resourcepacks shaders контент моды модификации ресурспаки шейдеры моди",
  worlds:
    "worlds saves backups миры мир сохранения бэкапы резервные копии світи",
  servers: "servers multiplayer серверы сервер мультиплеер сервери",
  server: "own server host свой сервер хост власний",
  configs: "configs kubejs конфиги конфигурация конфіги",
  settings:
    "settings memory java arguments настройки память аргументы налаштування",
  statistics: "statistics статистика статистика",
  logs: "logs console логи консоль журнал",
};

const TAB_ICON: Record<InstanceTab, ReactNode> = {
  overview: <Info className="size-4 text-faint" />,
  content: <Boxes className="size-4 text-faint" />,
  worlds: <TreePine className="size-4 text-faint" />,
  servers: <Server className="size-4 text-faint" />,
  server: <ServerCog className="size-4 text-faint" />,
  configs: <FileCog className="size-4 text-faint" />,
  settings: <LSettings className="size-4 text-faint" />,
  statistics: <ChartArea className="size-4 text-faint" />,
  logs: <ScrollText className="size-4 text-faint" />,
};

type PaletteItem = Rankable & {
  icon: ReactNode;
  hint?: string;
  run: () => void;
};

const ITEM_CLASS =
  "flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted-foreground data-[selected=true]:bg-primary-soft-raised data-[selected=true]:text-foreground aria-disabled:opacity-50";

const GROUP_CLASS =
  "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[0.65rem] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-[0.09em] [&_[cmdk-group-heading]]:text-faint [&_[cmdk-group-heading]]:uppercase";

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
  const { t } = useTranslation();

  useFocusReturn(open);

  useEffect(() => {
    if (open) setRaw(initialQuery);
  }, [initialQuery, open]);

  const usage = useMemo(() => (open ? readPaletteUsage() : {}), [open]);

  const selectedIdentity = account ? accountIdentity(account) : null;
  const agentBlocked = agentBlockReason(account?.type);
  const isAgentBlocked = agentBlocked !== null;

  const items = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = [
      {
        id: "nav:home",
        section: "navigate",
        title: t("nav.play"),
        keywords: "home instances library главная сборки бібліотека",
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
        keywords: "ai assistant ассистент помощник помічник асистент",
        icon: <Sparkles className="size-4 text-faint" />,
        disabled: isAgentBlocked,
        run: () => openAgent(),
      },
      {
        id: "nav:people",
        section: "navigate",
        title: t("shell.nav.people"),
        keywords: "friends voice groups друзья голос группы друзі",
        icon: <BookUser className="size-4 text-faint" />,
        disabled: !account || account.type === "plain",
        run: () => navigate({ name: "people" }),
      },
      {
        id: "nav:profile",
        section: "navigate",
        title: t("shell.nav.profile"),
        keywords: "skins achievements профиль скины ачивки",
        icon: <UserRound className="size-4 text-faint" />,
        disabled: !account || account.type === "plain",
        run: () => navigate({ name: "profile", userId: OWN_PROFILE_ID }),
      },
      {
        id: "nav:settings",
        section: "navigate",
        title: t("settings.title"),
        keywords: "settings налаштування параметры",
        icon: <LSettings className="size-4 text-faint" />,
        disabled: isRunning,
        run: () => navigate({ name: "settings" }),
      },
      {
        id: "nav:accounts",
        section: "navigate",
        title: t("accounts.manage"),
        keywords: "accounts аккаунты акаунти",
        icon: <Users className="size-4 text-faint" />,
        run: () => navigate({ name: "accounts" }),
      },
      {
        id: "action:new-instance",
        section: "actions",
        title: t("shell.nav.newInstance"),
        keywords: "create import modpack создать импорт сборка",
        icon: <ListPlus className="size-4 text-faint" />,
        disabled: isRunning,
        run: () => openNewInstance(),
      },
    ];

    if (selected) {
      const key = instanceKey(selected);

      list.push({
        id: "action:open-folder",
        section: "actions",
        title: t("common.openFolder"),
        hint: selected.version.name,
        keywords: `folder папка ${selected.version.name}`,
        icon: <Folder className="size-4 text-faint" />,
        run: () => void api.shell.openPath(selected.versionPath),
      });

      for (const tab of INSTANCE_TABS) {
        list.push({
          id: `tab:${tab}`,
          section: "actions",
          title: t(`shell.tabs.${tab}`),
          hint: selected.version.name,
          keywords: `${INSTANCE_TAB_KEYWORDS[tab]} ${selected.version.name}`,
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
          keywords: `play launch запустить играть ${loader.name}`,
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
        keywords: `account switch аккаунт ${entry.type}`,
        icon: <AccountHead account={entry} size={18} />,
        run: () => void switchAccount(entry),
      });
    }

    if (!isAgentBlocked) {
      list.push({
        id: "action:agent-chat",
        section: "agent",
        title: t("agent.newChat"),
        keywords: "ai ассистент чат помічник",
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
        keywords: `settings настройки налаштування ${section} ${entryWords}`,
        icon: <LSettings className="size-4 text-faint" />,
        disabled: isRunning,
        run: () => navigate({ name: "settings", section }),
      });
    }

    return list;
  }, [
    account,
    accounts,
    agentBlocked,
    isAgentBlocked,
    isRunning,
    runGame,
    selected,
    selectedIdentity,
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
        <Sparkles className="size-4 text-primary" />
        <span className="min-w-0 flex-1 truncate">
          {t("shell.palette.askAgent", { query: query.trim() })}
        </span>
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
      overlayClassName="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]"
      contentClassName="fixed top-20 left-1/2 z-50 w-[38rem] -translate-x-1/2 overflow-hidden rounded-2xl border border-input bg-popover shadow-2xl"
    >
      <DialogTitle className="sr-only">{t("shell.palette.label")}</DialogTitle>

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
            {(["actions", "instances", "settings"] as const).map((key) => (
              <div key={key} className="flex items-center gap-2.5 text-sm">
                <kbd className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 font-mono text-xs text-muted-foreground">
                  {key === "actions" ? ">" : key === "instances" ? "@" : "#"}
                </kbd>
                <span className="text-muted-foreground">
                  {t(`shell.palette.modes.${key}`)}
                </span>
              </div>
            ))}
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
                    <span className="min-w-0 flex-1 truncate">
                      <Highlight text={item.title} query={query} />
                    </span>
                    {(item as PaletteItem).hint && (
                      <span className="shrink-0 truncate font-mono text-[0.7rem] text-faint">
                        {(item as PaletteItem).hint}
                      </span>
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

      <div className="flex h-8 shrink-0 items-center gap-3 border-t border-border px-3 text-[0.65rem] text-faint">
        <span className="flex items-center gap-1">
          <CornerDownLeft className="size-3" />
          {t("shell.palette.open")}
        </span>
        <span className="flex items-center gap-1">
          <AtSign className="size-3" />
          {t("shell.palette.modes.instances")}
        </span>
        <span className="flex items-center gap-1">
          <Hash className="size-3" />
          {t("shell.palette.modes.settings")}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <kbd className="font-mono">Esc</kbd>
          {t("common.close")}
        </span>
      </div>
    </Command.Dialog>
  );
}
