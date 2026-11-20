import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { DataLocationInfo, DataLocationPlan } from "@/types/DataLocation";
import { showFailureToast } from "@renderer/utilities/failures";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { formatBytes } from "@renderer/utilities/file";
import { countFeature } from "@renderer/features/usage/usage";

const api = window.api;

export type ReadyDataPlan = Exclude<DataLocationPlan, { kind: "error" }>;

export function useBytesFormatter(): (value: number) => string {
  const { t } = useTranslation();
  const sizes = [
    t("sizes.0"),
    t("sizes.1"),
    t("sizes.2"),
    t("sizes.3"),
    t("sizes.4"),
  ];
  return (value: number) => formatBytes(value, sizes, 1);
}

export function useDataLocationChooser() {
  const { t } = useTranslation();
  const bytes = useBytesFormatter();
  const [info, setInfo] = useState<DataLocationInfo | null>(null);
  const [checking, setChecking] = useState<"pick" | "default" | null>(null);
  const [plan, setPlan] = useState<ReadyDataPlan | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    void api.dataLocation.get().then(setInfo).catch(ignoreFailure);
  }, []);

  const choose = async (source: "pick" | "default") => {
    setChecking(source);
    try {
      const next =
        source === "pick"
          ? await api.dataLocation.pick()
          : await api.dataLocation.planDefault();
      if (!next) return;

      if (next.kind === "error") {
        toast.error(
          t(`dataLocation.problems.${next.problem}`, {
            size: bytes(next.bytes ?? 0),
            free: bytes(next.freeBytes ?? 0),
          }),
        );
        return;
      }

      setPlan(next);
    } catch (error) {
      showFailureToast(t("dataLocation.problems.failed"), error, {
        channels: ["dataLocation:pick", "dataLocation:planDefault"],
      });
    } finally {
      setChecking(null);
    }
  };

  const apply = async () => {
    if (!plan) return;
    countFeature("dataLocation.move");
    setApplying(true);

    try {
      const result = await api.dataLocation.apply(plan.kind);
      if (result.ok) return;
      toast.error(t(`dataLocation.problems.${result.problem}`));
    } catch (error) {
      showFailureToast(t("dataLocation.problems.failed"), error, {
        channels: ["dataLocation:apply"],
      });
    }

    setApplying(false);
    setPlan(null);
  };

  const cancel = useCallback(() => setPlan(null), []);

  return { info, checking, plan, applying, choose, apply, cancel, bytes };
}
