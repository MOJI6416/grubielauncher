import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import {
  Coins,
  Eye,
  Pencil,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import {
  listGrants,
  parseGrantKey,
  revokeAlways,
} from "@renderer/agent/permissions";
import { agentChatAtom, MAX_STEPS } from "@renderer/agent/store";
import {
  countAvailableTools,
  describeToolSurface,
  unavailableReason,
  type ToolGroupId,
} from "./toolCatalog";

const RISK_ICON = {
  read: Eye,
  write: Pencil,
  destructive: Trash2,
} as const;

const RISK_TONE = {
  read: "text-faint",
  write: "text-warning",
  destructive: "text-destructive",
} as const;

export function AgentContextRail({
  toolNames,
  isOnline,
  hasAccount,
}: {
  toolNames: string[];
  isOnline: boolean;
  hasAccount: boolean;
}) {
  const { t } = useTranslation();
  const chat = useAtomValue(agentChatAtom);
  const [grants, setGrants] = useState(() => listGrants());
  const [openGroup, setOpenGroup] = useState<ToolGroupId | null>(null);

  const groups = useMemo(() => describeToolSurface(toolNames), [toolNames]);
  const totals = useMemo(() => countAvailableTools(groups), [groups]);

  useEffect(() => {
    setGrants(listGrants());
  }, [chat.timeline]);

  return (
    <aside className="flex h-full min-h-0 w-60 shrink-0 flex-col gap-2.5 overflow-y-auto rounded-xl border border-border bg-surface-1 p-2.5">
      <div>
        <div className="flex items-baseline gap-2 px-1 pb-1.5">
          <span className="text-[0.65rem] font-semibold tracking-[0.09em] text-faint uppercase">
            {t("agent.rail.tools")}
          </span>
          <span className="ml-auto font-mono text-[0.65rem] tabular-nums text-faint">
            {totals.available}/{totals.total}
          </span>
        </div>

        <div className="space-y-0.5">
          {groups.map((group) => {
            const isOpen = openGroup === group.id;
            const blocked = group.entries.length - group.availableCount;

            return (
              <div key={group.id}>
                <button
                  type="button"
                  onClick={() =>
                    setOpenGroup((current) =>
                      current === group.id ? null : group.id,
                    )
                  }
                  className={cn(
                    "flex h-7 w-full items-center gap-2 rounded-md px-1.5 text-left text-xs transition-colors",
                    isOpen
                      ? "bg-surface-2 text-foreground"
                      : "text-muted-foreground hover:bg-surface-2",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {t(`agent.rail.groups.${group.id}`)}
                  </span>
                  {blocked > 0 && (
                    <TriangleAlert className="size-3 shrink-0 text-faint" />
                  )}
                  <span className="shrink-0 font-mono text-[0.65rem] tabular-nums text-faint">
                    {group.availableCount}
                  </span>
                </button>

                {isOpen && (
                  <ul className="space-y-0.5 py-1 pl-1.5">
                    {group.entries.map((entry) => {
                      const Icon = RISK_ICON[entry.risk];
                      const reason = entry.available
                        ? null
                        : unavailableReason(entry.need, {
                            isOnline,
                            hasAccount,
                          });

                      return (
                        <Hint
                          key={entry.name}
                          side="left"
                          content={
                            reason
                              ? t(`agent.rail.needs.${reason}`)
                              : t(`agent.risk.${entry.risk}`)
                          }
                        >
                          <li
                            className={cn(
                              "flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[0.7rem]",
                              entry.available
                                ? "text-muted-foreground"
                                : "text-faint line-through",
                            )}
                          >
                            <Icon
                              className={cn(
                                "size-3 shrink-0",
                                entry.available
                                  ? RISK_TONE[entry.risk]
                                  : "text-faint",
                              )}
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {t(`agent.toolNames.${entry.name}`, {
                                defaultValue: entry.name,
                              })}
                            </span>
                          </li>
                        </Hint>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-baseline gap-2 px-1 pb-1.5">
          <span className="text-[0.65rem] font-semibold tracking-[0.09em] text-faint uppercase">
            {t("agent.rail.permissions")}
          </span>
        </div>

        {grants.length === 0 ? (
          <p className="flex items-start gap-1.5 px-1 text-[0.7rem] leading-4 text-faint">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            {t("agent.rail.permissionsEmpty")}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {grants.map((key) => {
              const grant = parseGrantKey(key);
              const label = t(`agent.toolNames.${grant.name}`, {
                defaultValue: grant.name,
              });
              const where =
                grant.scope ?? t("agent.rail.grantEverywhere");

              return (
                <li
                  key={key}
                  className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[0.7rem] text-muted-foreground"
                >
                  <Pencil className="mt-0.5 size-3 shrink-0 self-start text-warning" />
                  <Hint
                    content={`${label} · ${where}`}
                    variant="text"
                    side="left"
                  >
                    <span className="grid min-w-0 flex-1 gap-px">
                      <span className="truncate">{label}</span>
                      <span className="truncate text-faint">{where}</span>
                    </span>
                  </Hint>
                  <Hint content={t("agent.rail.revoke")}>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("agent.rail.revoke")}
                      onClick={() => {
                        revokeAlways(key);
                        setGrants(listGrants());
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </Hint>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {(chat.usage?.totalTokens || chat.steps > 0) && (
        <div className="mt-auto rounded-lg bg-surface-2 p-2">
          <div className="flex items-center gap-1.5 pb-1 text-[0.65rem] font-semibold tracking-[0.09em] text-faint uppercase">
            <Coins className="size-3" />
            {t("agent.rail.usage")}
          </div>
          <dl className="space-y-0.5 text-[0.7rem]">
            {chat.usage?.totalTokens ? (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-faint">{t("agent.rail.tokens")}</dt>
                <dd className="font-mono tabular-nums text-muted-foreground">
                  {chat.usage.totalTokens}
                </dd>
              </div>
            ) : null}
            {typeof chat.usage?.cost === "number" && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-faint">{t("agent.rail.cost")}</dt>
                <dd className="font-mono tabular-nums text-muted-foreground">
                  ${chat.usage.cost.toFixed(4)}
                </dd>
              </div>
            )}
            {chat.steps > 0 && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-faint">{t("agent.rail.steps")}</dt>
                <dd className="font-mono tabular-nums text-muted-foreground">
                  {chat.steps}/{MAX_STEPS}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </aside>
  );
}
