import { toast } from "sonner";
import i18n from "@renderer/i18n";
import type { Version } from "@renderer/classes/Version";
import { navigate } from "@renderer/navigation/navigate";
import { instanceKey } from "@renderer/features/instances/selectors";
import { showErrorToast } from "@renderer/utilities/errorToast";
import { uiJournal } from "@renderer/utilities/journal";

const api = window.api;

export async function prepareJavaForLaunch(version: Version): Promise<boolean> {
  const t = i18n.t.bind(i18n);
  const downloading = version.java?.problem === "not_installed";
  const toastId = downloading
    ? toast.loading(t("java.launch.downloading", { major: version.java?.major }))
    : undefined;

  const result = await api.java.prepare(version.version).finally(() => {
    if (toastId !== undefined) toast.dismiss(toastId);
  });

  uiJournal.info("launch", "java prepared", {
    ok: result.ok,
    problem: result.ok ? undefined : result.problem,
    major: result.java?.major,
    required: result.java?.requiredMajor,
    via: result.java?.via,
    source: result.java?.source,
    vendor: result.java?.vendor,
  });

  if (result.ok) {
    version.java = result.java;
    version.javaPath = result.java.client;
    return true;
  }

  const major = result.java?.major;
  const openSettings = {
    label: t("java.launch.openSettings"),
    onClick: () =>
      navigate({ name: "instance", id: instanceKey(version), tab: "settings" }),
  };

  switch (result.problem) {
    case "busy":
      toast.error(t("java.launch.busy"));
      break;
    case "download_failed":
      showErrorToast(
        t("java.launch.downloadFailed", { major }),
        t("java.launch.downloadFailedHint"),
        t("common.copy"),
      );
      break;
    case "missing":
    case "untrusted":
      toast.error(t(`java.launch.${result.problem}`), {
        description: t("java.launch.chosenHint"),
        duration: 15000,
        action: openSettings,
      });
      break;
    default:
      toast.error(t("java.launch.notInstalled", { major }));
  }

  return false;
}
