import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Ban,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  Undo2,
  UserRound,
  Users,
  UserX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Hint } from "@renderer/components/Hint";
import { SegmentedControl } from "@renderer/components/SegmentedControl";
import { showFailureToast } from "@renderer/utilities/failures";
import { showUndoToast } from "@renderer/utilities/undoToast";
import type {
  ServerAdminAction,
  ServerAdminGameRule,
  ServerAdminPlayer,
  ServerAdminResult,
  ServerAdminSnapshot,
} from "@/types/ServerAdmin";
import {
  adminModeHintKey,
  adminModeLabelKey,
  isOperator,
  isValidPlayerName,
  ruleLabel,
} from "./serverAdminModel";

type PlayersTab = "online" | "operators" | "bans";

function Initials({ name }: { name: string }) {
  return (
    <Avatar className="size-6 shrink-0">
      <AvatarFallback className="text-3xs">
        {name ? name.slice(0, 2).toUpperCase() : <UserRound className="size-3" />}
      </AvatarFallback>
    </Avatar>
  );
}

function IconAction({
  label,
  disabled,
  danger,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Hint content={label}>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={label}
        disabled={disabled}
        className={danger ? "text-muted-foreground hover:text-destructive" : undefined}
        onClick={onClick}
      >
        {children}
      </Button>
    </Hint>
  );
}

function PlayerRow({
  player,
  meta,
  children,
}: {
  player: ServerAdminPlayer;
  meta?: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex h-9 items-center gap-2.5 rounded-lg px-1.5 hover:bg-row-hover">
      <Initials name={player.name} />
      <Hint content={player.name} variant="text" truncatedOnly>
        <span className="min-w-0 flex-1 truncate font-mono text-sm">{player.name}</span>
      </Hint>
      {meta && (
        <Hint content={meta} variant="text" truncatedOnly>
          <span className="max-w-32 shrink truncate text-xs text-faint">{meta}</span>
        </Hint>
      )}
      <span className="flex shrink-0 items-center gap-0.5">{children}</span>
    </li>
  );
}

function RuleRow({
  rule,
  disabled,
  onChange,
}: {
  rule: ServerAdminGameRule;
  disabled: boolean;
  onChange: (value: boolean | number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const label = ruleLabel(rule.key);
  const commit = () => {
    if (draft === null) return;
    const value = Number(draft);
    setDraft(null);
    if (Number.isFinite(value) && Math.trunc(value) !== rule.value) onChange(Math.trunc(value));
  };

  return (
    <li className="flex h-9 items-center gap-2 rounded-lg px-1.5 hover:bg-row-hover">
      <Hint content={rule.key} variant="text" truncatedOnly>
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{label}</span>
      </Hint>
      {rule.type === "boolean" ? (
        <Switch
          checked={rule.value === true}
          disabled={disabled || rule.value === null}
          aria-label={label}
          onCheckedChange={(checked) => onChange(checked)}
        />
      ) : (
        <Input
          type="number"
          inputMode="numeric"
          aria-label={label}
          disabled={disabled}
          value={draft ?? (rule.value === null ? "" : String(rule.value))}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") setDraft(null);
          }}
          className="h-7 w-20 shrink-0 font-mono text-xs tabular-nums"
        />
      )}
    </li>
  );
}

export function ServerPlayersPanel({
  snapshot,
  isRunning,
  perform,
  refresh,
}: {
  snapshot: ServerAdminSnapshot;
  isRunning: boolean;
  perform: (action: ServerAdminAction) => Promise<ServerAdminResult>;
  refresh: (gamerules?: boolean) => Promise<ServerAdminSnapshot>;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<PlayersTab>("online");
  const [newName, setNewName] = useState("");
  const [ruleQuery, setRuleQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingRules, setLoadingRules] = useState(false);

  const rules = useMemo(() => {
    const needle = ruleQuery.trim().toLowerCase();
    return needle
      ? snapshot.gamerules.filter((rule) => rule.key.toLowerCase().includes(needle))
      : snapshot.gamerules;
  }, [ruleQuery, snapshot.gamerules]);

  const run = async (action: ServerAdminAction, done?: string) => {
    setBusy(true);
    try {
      const result = await perform(action);
      if (!result.ok) {
        showFailureToast(t("serverAdmin.actionFailed"), result.error, {
          channels: ["serverAdmin:perform"],
        });
        return false;
      }
      if (done) toast.success(done);
      return true;
    } finally {
      setBusy(false);
    }
  };

  const ban = async (name: string) => {
    if (!(await run({ type: "ban", name }))) return;
    showUndoToast(t("serverAdmin.banned", { name }), () => {
      void run({ type: "pardon", name });
    });
  };

  const addToAllowlist = async () => {
    const name = newName.trim();
    if (!isValidPlayerName(name)) return;
    if (await run({ type: "allowlistAdd", name })) setNewName("");
  };

  if (!isRunning || snapshot.mode === "none") {
    return (
      <div className="flex min-h-0 items-center justify-center rounded-xl border bg-card">
        <Empty className="border-0 bg-transparent">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>{t("serverAdmin.stoppedTitle")}</EmptyTitle>
            <EmptyDescription>{t("serverAdmin.stoppedDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const disabled = busy || snapshot.connecting;
  const nameIsValid = isValidPlayerName(newName.trim());
  const list =
    tab === "online"
      ? snapshot.players
      : tab === "operators"
        ? snapshot.operators
        : snapshot.bans;

  return (
    <div className="grid min-h-0 grid-cols-2 gap-3">
      <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <SegmentedControl
            value={tab}
            ariaLabel={t("serverAdmin.listsLabel")}
            options={(["online", "operators", "bans"] as const).map((value) => ({
              value,
              label: `${t(`serverAdmin.tabs.${value}`)} ${
                value === "online"
                  ? snapshot.players.length
                  : value === "operators"
                    ? snapshot.operators.length
                    : snapshot.bans.length
              }`,
            }))}
            onChange={setTab}
          />
          <Hint content={t(adminModeHintKey(snapshot))} className="max-w-64">
            <span className="ml-auto shrink-0 rounded-md bg-surface-3 px-1.5 py-0.5 text-2xs whitespace-nowrap text-muted-foreground">
              {t(adminModeLabelKey(snapshot))}
            </span>
          </Hint>
        </div>

        {list.length === 0 ? (
          <Empty className="flex-1 border-0 bg-transparent">
            <EmptyHeader>
              <EmptyDescription>{t(`serverAdmin.empty.${tab}`)}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <ul className="grid gap-0.5 p-1.5">
              {tab === "online" &&
                snapshot.players.map((player) => {
                  const operator = isOperator(snapshot, player);
                  return (
                    <PlayerRow key={player.id ?? player.name} player={player}>
                      <IconAction
                        label={
                          operator
                            ? t("serverAdmin.deop", { name: player.name })
                            : t("serverAdmin.op", { name: player.name })
                        }
                        disabled={disabled}
                        onClick={() =>
                          void run({ type: operator ? "deop" : "op", name: player.name })
                        }
                      >
                        {operator ? <ShieldOff /> : <ShieldCheck />}
                      </IconAction>
                      <IconAction
                        label={t("serverAdmin.kick", { name: player.name })}
                        disabled={disabled}
                        danger
                        onClick={() =>
                          void run(
                            {
                              type: "kick",
                              name: player.name,
                              message: t("serverAdmin.kickMessage"),
                            },
                            t("serverAdmin.kicked", { name: player.name }),
                          )
                        }
                      >
                        <UserX />
                      </IconAction>
                      <IconAction
                        label={t("serverAdmin.ban", { name: player.name })}
                        disabled={disabled}
                        danger
                        onClick={() => void ban(player.name)}
                      >
                        <Ban />
                      </IconAction>
                    </PlayerRow>
                  );
                })}

              {tab === "operators" &&
                snapshot.operators.map((player) => (
                  <PlayerRow
                    key={player.id ?? player.name}
                    player={player}
                    meta={
                      player.permissionLevel
                        ? t("serverAdmin.level", { level: player.permissionLevel })
                        : undefined
                    }
                  >
                    <IconAction
                      label={t("serverAdmin.deop", { name: player.name })}
                      disabled={disabled}
                      onClick={() => void run({ type: "deop", name: player.name })}
                    >
                      <ShieldOff />
                    </IconAction>
                  </PlayerRow>
                ))}

              {tab === "bans" &&
                snapshot.bans.map((player) => (
                  <PlayerRow key={player.id ?? player.name} player={player} meta={player.reason}>
                    <IconAction
                      label={t("serverAdmin.pardon", { name: player.name })}
                      disabled={disabled}
                      onClick={() => void run({ type: "pardon", name: player.name })}
                    >
                      <Undo2 />
                    </IconAction>
                  </PlayerRow>
                ))}
            </ul>
          </ScrollArea>
        )}
      </section>

      <div className="grid min-h-0 grid-rows-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
          <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {t("serverAdmin.allowlist.title")}
            </span>
            <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              {t("serverAdmin.allowlist.enabled")}
              <Switch
                checked={snapshot.allowlistEnabled === true}
                disabled={disabled || snapshot.allowlistEnabled === null}
                onCheckedChange={(enabled) => void run({ type: "allowlistEnabled", enabled })}
              />
            </label>
          </div>
          <form
            className="flex shrink-0 items-center gap-2 px-3 py-2"
            onSubmit={(event) => {
              event.preventDefault();
              void addToAllowlist();
            }}
          >
            <Input
              value={newName}
              maxLength={16}
              placeholder={t("serverAdmin.allowlist.placeholder")}
              aria-label={t("serverAdmin.allowlist.placeholder")}
              onChange={(event) => setNewName(event.target.value)}
              className="h-8 flex-1 font-mono text-xs"
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={disabled || !nameIsValid}
            >
              <Plus />
              {t("serverAdmin.allowlist.add")}
            </Button>
          </form>
          {snapshot.allowlist.length === 0 ? (
            snapshot.allowlistEnabled ? (
              <p className="px-3 pb-2 text-xs text-warning">
                {t("serverAdmin.allowlist.emptyOn")}
              </p>
            ) : (
              <p className="px-3 pb-2 text-xs text-faint">{t("serverAdmin.allowlist.empty")}</p>
            )
          ) : (
            <ScrollArea className="min-h-0 flex-1">
              <ul className="grid gap-0.5 px-1.5 pb-1.5">
                {snapshot.allowlist.map((player) => (
                  <PlayerRow key={player.id ?? player.name} player={player}>
                    <IconAction
                      label={t("serverAdmin.allowlist.remove", { name: player.name })}
                      disabled={disabled}
                      onClick={() => void run({ type: "allowlistRemove", name: player.name })}
                    >
                      <X />
                    </IconAction>
                  </PlayerRow>
                ))}
              </ul>
            </ScrollArea>
          )}
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
          <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {t("serverAdmin.rules.title")}
            </span>
            {snapshot.gamerulesLoaded && snapshot.gamerules.length > 8 && (
              <span className="relative flex items-center">
                <Search className="pointer-events-none absolute left-2 size-3 text-faint" />
                <Input
                  value={ruleQuery}
                  onChange={(event) => setRuleQuery(event.target.value)}
                  placeholder={t("serverAdmin.rules.search")}
                  aria-label={t("serverAdmin.rules.search")}
                  className="h-7 w-36 pl-6 text-xs"
                />
              </span>
            )}
            {snapshot.mode === "stdin" && (
              <Hint content={t("serverAdmin.rules.reload")}>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={t("serverAdmin.rules.reload")}
                  disabled={loadingRules || disabled}
                  onClick={() => {
                    setLoadingRules(true);
                    void refresh(true).finally(() => setLoadingRules(false));
                  }}
                >
                  <RefreshCw className={loadingRules ? "animate-spin" : undefined} />
                </Button>
              </Hint>
            )}
          </div>
          {!snapshot.gamerulesLoaded ? (
            <Empty className="flex-1 border-0 bg-transparent">
              <EmptyHeader>
                <EmptyDescription>{t("serverAdmin.rules.notLoaded")}</EmptyDescription>
              </EmptyHeader>
              <Button
                size="sm"
                variant="outline"
                disabled={loadingRules || disabled}
                onClick={() => {
                  setLoadingRules(true);
                  void refresh(true).finally(() => setLoadingRules(false));
                }}
              >
                <RefreshCw className={loadingRules ? "animate-spin" : undefined} />
                {t("serverAdmin.rules.load")}
              </Button>
            </Empty>
          ) : rules.length === 0 ? (
            <p className="px-3 py-2 text-xs text-faint">{t("serverAdmin.rules.notFound")}</p>
          ) : (
            <ScrollArea className="min-h-0 flex-1">
              <ul className="grid gap-0.5 p-1.5">
                {rules.map((rule) => (
                  <RuleRow
                    key={rule.key}
                    rule={rule}
                    disabled={disabled}
                    onChange={(value) => void run({ type: "gamerule", key: rule.key, value })}
                  />
                ))}
              </ul>
            </ScrollArea>
          )}
        </section>
      </div>
    </div>
  );
}
