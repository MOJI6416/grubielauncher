import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { IVersionStatistics } from "@/types/VersionStatistics";
import { useTranslation } from "react-i18next";
import { formatDate, formatTime } from "@renderer/utilities/date";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { CalendarClock, CircleAlert, Clock3, Rocket } from "lucide-react";
import type { ReactNode } from "react";

export function VersionStatistics({
  onClose,
  statistics,
}: {
  onClose: () => void;
  statistics: IVersionStatistics;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t("versionStatistics.title")}</DialogTitle>
        </DialogHeader>

        <div className="min-w-0">
          {!statistics && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>{t("versionStatistics.error")}</AlertTitle>
            </Alert>
          )}
          {statistics && (
            <div className="grid gap-3">
              <Card className="overflow-hidden border-border/80 bg-card/80 py-0">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-muted/40 text-muted-foreground">
                    <Clock3 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">
                      {t("versionStatistics.playTime")}
                    </p>
                    <p className="mt-1 truncate text-2xl font-semibold tracking-tight">
                      {formatTime(statistics.playTime, {
                        h: t("time.h"),
                        m: t("time.m"),
                        s: t("time.s"),
                      })}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-3">
                <StatisticCard
                  icon={<Rocket className="h-4 w-4" />}
                  label={t("versionStatistics.launches")}
                  value={statistics.launches}
                />
                <StatisticCard
                  icon={<CalendarClock className="h-4 w-4" />}
                  label={t("versionStatistics.lastLaunch")}
                  value={formatDate(new Date(statistics.lastLaunched))}
                />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatisticCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <Card className="min-w-0 border-border/80 bg-card/70 py-0">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
            {icon}
          </span>
          <span className="min-w-0 truncate">{label}</span>
        </div>
        <div className="mt-3 min-w-0 truncate text-lg font-semibold">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
