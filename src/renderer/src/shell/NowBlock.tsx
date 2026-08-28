import { ReactNode, useMemo } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  Bell,
  HardDriveDownload,
  Sparkles,
  SquareChevronRight,
  Wifi,
} from "lucide-react";
import { Collapse } from "@/components/ui/collapse";
import { Hint } from "@renderer/components/Hint";
import { agentChatAtom, MAX_STEPS } from "@renderer/agent/store";
import { activeToolLabel } from "@renderer/features/agent/timelineGroups";
import {
  accountAtom,
  consolesMetaAtom,
  errorLogAtom,
  errorLogSeenAtom,
  isShareModalOpenAtom,
  shareOwnerAccountKeyAtom,
  shareStateAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { instanceKey } from "@renderer/features/instances/selectors";
import { canCurrentAccountManageShare } from "@renderer/utilities/shareAccount";
import { navigate } from "@renderer/navigation/navigate";
import { clampPercent } from "@renderer/features/install/progressModel";
import {
  installProgressAtom,
  openTaskCenter,
} from "@renderer/features/install/installUi";

function NowRow({
  icon,
  label,
  detail,
  tone = "text-faint",
  progress,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  tone?: string;
  progress?: number | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col justify-center gap-1 rounded-lg px-2.5 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
    >
      <span className="flex w-full items-center gap-2.5">
        <span className={`shrink-0 ${tone}`}>{icon}</span>
        <Hint content={label} variant="text" side="right" truncatedOnly>
          <span className="min-w-0 flex-1 truncate text-[0.8rem]">{label}</span>
        </Hint>
        {detail && (
          <span className="shrink-0 font-mono text-[0.65rem] tabular-nums text-faint">
            {detail}
          </span>
        )}
      </span>

      {progress !== undefined && (
        <span className="block h-0.5 w-full overflow-hidden rounded-full bg-surface-3">
          <span
            className={`block h-full rounded-full bg-primary transition-[width] duration-300 ease-swift ${
              progress === null ? "w-1/3 animate-pulse" : ""
            }`}
            style={progress === null ? undefined : { width: `${progress}%` }}
          />
        </span>
      )}
    </button>
  );
}

export function NowBlock({ onOpenErrors }: { onOpenErrors: () => void }) {
  const consoleMetas = useAtomValue(consolesMetaAtom);
  const versions = useAtomValue(versionsAtom);
  const errorLog = useAtomValue(errorLogAtom);
  const [errorLogSeen, setErrorLogSeen] = useAtom(errorLogSeenAtom);
  const shareState = useAtomValue(shareStateAtom);
  const shareOwnerAccountKey = useAtomValue(shareOwnerAccountKeyAtom);
  const account = useAtomValue(accountAtom);
  const setIsShareOpen = useAtom(isShareModalOpenAtom)[1];
  const progress = useAtomValue(installProgressAtom);
  const agentChat = useAtomValue(agentChatAtom);
  const { t } = useTranslation();

  const running = useMemo(
    () => consoleMetas.filter((meta) => meta.status === "running").slice(0, 3),
    [consoleMetas],
  );

  const unseenErrors = errorLog.filter(
    (entry) => entry.time > errorLogSeen,
  ).length;

  const showShare =
    !["idle", "lan_not_found"].includes(shareState.phase) &&
    canCurrentAccountManageShare(shareOwnerAccountKey, account);

  const rows: ReactNode[] = [];

  for (const meta of running) {
    const instance = versions.find(
      (version) => version.version.name === meta.versionName,
    );

    rows.push(
      <NowRow
        key={`run-${meta.versionName}-${meta.instance}`}
        tone="text-success"
        icon={<SquareChevronRight className="size-4" />}
        label={meta.versionName}
        detail={t("versions.running")}
        onClick={() => {
          if (!instance) return;
          navigate({
            name: "instance",
            id: instanceKey(instance),
            tab: "logs",
          });
        }}
      />,
    );
  }

  if (progress) {
    rows.push(
      <NowRow
        key="install"
        tone="text-primary"
        icon={<HardDriveDownload className="size-4" />}
        label={progress.versionName}
        detail={
          progress.isIndeterminate
            ? "…"
            : `${clampPercent(progress.progressPercent)}%`
        }
        progress={
          progress.isIndeterminate
            ? null
            : clampPercent(progress.progressPercent)
        }
        onClick={() => openTaskCenter()}
      />,
    );
  }

  if (agentChat.running) {
    const activeTool = activeToolLabel(agentChat.timeline);

    rows.push(
      <NowRow
        key="agent"
        tone="text-primary"
        icon={<Sparkles className="size-4" />}
        label={
          activeTool
            ? t(activeTool.label.key, {
                ...activeTool.label.params,
                defaultValue: activeTool.name,
              })
            : t("agent.working")
        }
        detail={`${agentChat.steps}/${MAX_STEPS}`}
        onClick={() => navigate({ name: "agent" })}
      />,
    );
  }

  if (showShare) {
    rows.push(
      <NowRow
        key="share"
        tone={shareState.phase === "online" ? "text-success" : "text-warning"}
        icon={<Wifi className="size-4" />}
        label={t("share.title")}
        onClick={() => setIsShareOpen(true)}
      />,
    );
  }

  if (errorLog.length > 0) {
    rows.push(
      <NowRow
        key="errors"
        tone={unseenErrors > 0 ? "text-destructive" : "text-faint"}
        icon={<Bell className="size-4" />}
        label={t("errorLog.title")}
        detail={unseenErrors > 0 ? String(unseenErrors) : undefined}
        onClick={() => {
          setErrorLogSeen(errorLog[0]?.time ?? Date.now());
          onOpenErrors();
        }}
      />,
    );
  }

  return (
    <Collapse show={rows.length > 0}>
      {rows.length > 0 ? (
        <div className="mt-3 border-t border-border pt-2.5">
          <span className="block px-2.5 pb-1 text-[0.65rem] font-semibold tracking-[0.09em] text-faint uppercase">
            {t("shell.now")}
          </span>
          <div className="flex flex-col gap-0.5">{rows}</div>
        </div>
      ) : null}
    </Collapse>
  );
}
