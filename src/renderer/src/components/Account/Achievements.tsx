import { IUser } from "@/types/IUser";
import { ILocalAccount } from "@/types/Account";
import {
  IAchievementStats,
  EMPTY_ACHIEVEMENT_STATS,
} from "@/types/Achievements";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  Crown,
  Loader2,
  Lock,
  Search,
  Trophy,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAtom } from "jotai";
import {
  accountAtom,
  accountsAtom,
  authDataAtom,
  networkAtom,
} from "@renderer/stores/atoms";
import {
  ensureAccountSession,
  isAccountSessionRefreshError,
} from "@renderer/utilities/accountSession";
import {
  AchievementCategory,
  AchievementRarity,
  CATEGORY_ICON,
  CATEGORY_ORDER,
  IAchievementProgress,
  evaluateAchievements,
  levelFromPoints,
  levelInfo,
  metricDisplay,
} from "@renderer/utilities/achievements";
import { fetchMergedAchievementStats } from "@renderer/utilities/achievementStats";
import { Leaderboard } from "./Leaderboard";

const api = window.api;

type StatusFilter = "all" | "unlocked" | "locked";

const RARITY_CLASS: Record<AchievementRarity, string> = {
  common: "text-muted-foreground",
  rare: "text-foreground",
  epic: "text-primary",
  legendary: "text-primary",
};

export function Achievements({
  onClose,
  user,
}: {
  onClose: () => void;
  user: IUser;
}) {
  const { t, i18n } = useTranslation();
  const formatNumber = (value: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage || i18n.language).format(value);

  const [account, setSelectedAccount] = useAtom(accountAtom);
  const [accounts, setAccounts] = useAtom(accountsAtom);
  const [authData] = useAtom(authDataAtom);
  const [isBackendOnline] = useAtom(networkAtom);

  const [stats, setStats] = useState<IAchievementStats | null>(null);
  const [loading, setLoading] = useState(true);

  const [category, setCategory] = useState<AchievementCategory | "all">("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = account
          ? await fetchMergedAchievementStats(account)
          : EMPTY_ACHIEVEMENT_STATS;
        if (!cancelled) setStats(data);
      } catch {
        if (!cancelled) setStats(EMPTY_ACHIEVEMENT_STATS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account]);

  const progress = useMemo(
    () =>
      evaluateAchievements(
        stats ?? EMPTY_ACHIEVEMENT_STATS,
        user.playTime,
        user.achievements,
      ),
    [stats, user.playTime, user.achievements],
  );

  const summary = useMemo(() => {
    const unlocked = progress.filter((p) => p.unlocked);
    const points = unlocked.reduce((sum, p) => sum + p.def.points, 0);
    const completion =
      progress.length > 0
        ? Math.round((unlocked.length / progress.length) * 100)
        : 0;
    return {
      unlockedCount: unlocked.length,
      total: progress.length,
      points,
      level: levelFromPoints(points),
      completion,
    };
  }, [progress]);

  useEffect(() => {
    if (loading || !account?.accessToken || !isBackendOnline) return;

    const unlockedIds = progress.filter((p) => p.unlocked).map((p) => p.def.id);
    const missing = unlockedIds.filter((id) => !user.achievements.includes(id));
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        let acc: ILocalAccount = account;
        if (authData && account.type !== "plain") {
          const refreshed = await ensureAccountSession({
            accounts,
            authData,
            selectedAccount: account,
            setAccounts,
            setSelectedAccount,
          });
          acc = refreshed.account;
        }
        if (cancelled) return;
        await api.backend.updateUser(acc.accessToken || "", user._id, {
          achievements: unlockedIds,
        });
      } catch (err) {
        if (!isAccountSessionRefreshError(err)) console.error(err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, progress, account, isBackendOnline]);

  const counts = useMemo(() => {
    const byCategory = new Map<AchievementCategory, number>();
    for (const p of progress) {
      if (p.unlocked)
        byCategory.set(
          p.def.category,
          (byCategory.get(p.def.category) ?? 0) + 1,
        );
    }
    return byCategory;
  }, [progress]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return progress.filter((p) => {
      if (category !== "all" && p.def.category !== category) return false;
      if (status === "unlocked" && !p.unlocked) return false;
      if (status === "locked" && p.unlocked) return false;
      if (q) {
        const name = t(`achievements.items.${p.def.id}.name`).toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });
  }, [progress, category, status, query, t]);

  return (
    <>
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="flex max-h-[88vh] flex-col gap-4 overflow-hidden sm:max-w-3xl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="size-5 text-primary" />
            {t("achievements.title")}
          </DialogTitle>
        </DialogHeader>

        <SummaryBand summary={summary} formatNumber={formatNumber} t={t} />

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("achievements.search")}
                className="h-9 pl-8"
              />
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-lg bg-muted/50 p-0.5">
              {(["all", "unlocked", "locked"] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    status === s
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(`achievements.filter.${s}`)}
                </button>
              ))}
            </div>
          </div>

          <div
            className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
            onWheel={(e) => {
              if (e.deltaY === 0) return;
              e.currentTarget.scrollLeft += e.deltaY;
            }}
          >
            <CategoryChip
              active={category === "all"}
              onClick={() => setCategory("all")}
              label={t("achievements.filter.all")}
            />
            {CATEGORY_ORDER.map((cat) => {
              const Icon = CATEGORY_ICON[cat];
              return (
                <CategoryChip
                  key={cat}
                  active={category === cat}
                  onClick={() => setCategory(cat)}
                  label={t(`achievements.categories.${cat}`)}
                  count={counts.get(cat) ?? 0}
                  icon={<Icon className="size-3.5" />}
                />
              );
            })}
          </div>
        </div>

        <div className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1 pb-1">
          {loading ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <p className="text-sm">{t("achievements.loading")}</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-xl border bg-muted/20 text-sm text-muted-foreground">
              {t("achievements.empty")}
            </div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {visible.map((p) => (
                <AchievementCard
                  key={p.def.id}
                  item={p}
                  t={t}
                  formatNumber={formatNumber}
                />
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="secondary" onClick={() => setShowLeaderboard(true)}>
            <Crown className="size-4" />
            {t("leaderboard.title")}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      {showLeaderboard && (
        <Leaderboard user={user} onClose={() => setShowLeaderboard(false)} />
      )}
    </>
  );
}

function SummaryBand({
  summary,
  formatNumber,
  t,
}: {
  summary: {
    unlockedCount: number;
    total: number;
    points: number;
    level: number;
    completion: number;
  };
  formatNumber: (value: number) => string;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const lvl = levelInfo(summary.points);
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-muted/25 px-3 py-2.5">
      <CompletionRing value={summary.completion} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          <span className="font-semibold">
            {t("achievements.level")} {formatNumber(summary.level)}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="tabular-nums">
            {formatNumber(summary.points)} {t("achievements.points")}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="tabular-nums text-muted-foreground">
            {formatNumber(summary.unlockedCount)}/{formatNumber(summary.total)}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <Progress value={lvl.ratio * 100} max={100} className="h-1.5 flex-1" />
          <span
            className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
            title={t("achievements.toNextLevel", { level: lvl.nextLevel })}
          >
            {formatNumber(lvl.intoLevel)}/{formatNumber(lvl.levelSpan)}
          </span>
        </div>
      </div>
    </div>
  );
}

function CompletionRing({ value }: { value: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <div className="relative size-12 shrink-0">
      <svg viewBox="0 0 48 48" className="size-12 -rotate-90">
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          strokeWidth="5"
          className="stroke-muted"
        />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="stroke-primary transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums">
        {value}%
      </span>
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  label,
  count,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span className="tabular-nums opacity-70">{count}</span>
      )}
    </button>
  );
}

function AchievementCard({
  item,
  t,
  formatNumber,
}: {
  item: IAchievementProgress;
  t: (key: string, options?: Record<string, unknown>) => string;
  formatNumber: (value: number) => string;
}) {
  const { def, unlocked, ratio, rarity, value } = item;
  const Icon = def.icon;
  const isGranted = !!def.granted;

  const current = isGranted ? 0 : metricDisplay(value, def.unit!);
  const goal = isGranted ? 0 : metricDisplay(def.goal!, def.unit!);
  const unitSuffix = isGranted
    ? ""
    : def.unit === "km"
      ? ` ${t("achievements.unit.km")}`
      : def.unit === "ticksHours" || def.unit === "secondsHours"
        ? ` ${t("time.h")}`
        : "";

  return (
    <div
      className={`flex gap-3 rounded-xl border p-3 transition-colors ${
        unlocked ? "border-primary/30 bg-primary/[0.04]" : "bg-card"
      }`}
    >
      <div
        className={`relative flex size-14 shrink-0 items-center justify-center rounded-lg border ${
          unlocked
            ? "border-primary/30 bg-primary/10 text-primary"
            : "bg-muted/40 text-muted-foreground"
        }`}
      >
        <Icon className={`size-6 ${unlocked ? "" : "opacity-60"}`} />
        {unlocked ? (
          <CheckCircle2 className="absolute -right-1.5 -top-1.5 size-4 rounded-full bg-background text-primary" />
        ) : (
          <Lock className="absolute -right-1.5 -top-1.5 size-4 rounded-full bg-background p-0.5 text-muted-foreground" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {t(`achievements.items.${def.id}.name`)}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {t(`achievements.items.${def.id}.desc`, {
                goal: formatNumber(goal),
              })}
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0 gap-1 tabular-nums">
            {def.points}
            <span className={`text-[10px] uppercase ${RARITY_CLASS[rarity]}`}>
              {t(`achievements.rarity.${rarity}`)}
            </span>
          </Badge>
        </div>

        {!unlocked && !isGranted && (
          <>
            <Progress value={ratio * 100} max={100} className="h-1.5" />
            <p className="text-[11px] tabular-nums text-muted-foreground">
              {formatNumber(current)}/{formatNumber(goal)}
              {unitSuffix}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
