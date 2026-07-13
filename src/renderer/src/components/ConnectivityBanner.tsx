import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { TriangleAlert, WifiOff } from "lucide-react";
import { internetAtom, networkAtom } from "../stores/atoms";
import { getConnectivityProblems } from "../utilities/connectivity";

export function ConnectivityBanner() {
  const { t } = useTranslation();
  const isInternetOnline = useAtomValue(internetAtom);
  const isBackendOnline = useAtomValue(networkAtom);

  const problem = getConnectivityProblems({
    isInternetOnline,
    isBackendOnline,
  })[0];

  if (!problem) return null;

  const Icon = problem === "internet" ? WifiOff : TriangleAlert;

  return (
    <div className="px-4 pt-2">
      <div className="flex items-center gap-2.5 rounded-lg border border-warning/25 bg-warning/10 px-3.5 py-2">
        <Icon className="size-4 shrink-0 text-warning" />
        <span className="text-sm text-foreground/85">
          {t(`app.serviceStatus.${problem}`)}
        </span>
      </div>
    </div>
  );
}
