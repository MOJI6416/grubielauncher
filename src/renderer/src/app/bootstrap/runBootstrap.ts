import { getDefaultStore } from "jotai";
import i18n, { changeAppLanguage } from "@renderer/i18n";
import { normalizeSettings, TSettings } from "@/types/Settings";
import { loadAccounts } from "@renderer/features/accounts/loadAccounts";
import { hydrateInstancesFile } from "@renderer/features/instances/instancesStore";
import {
  forgetLegacyViewPrefs,
  migrateInstancesViewPrefs,
  readLegacyViewPrefs,
} from "@renderer/features/instances/viewPrefsMigration";
import { checkWhatsNewAfterInit } from "@renderer/features/whatsNew/whatsNewStore";
import {
  accountAtom,
  pathsAtom,
  selectedVersionAtom,
  settingsAtom,
  versionsAtom,
  versionsLoadedAtom,
  versionsUnreadableAtom,
} from "@renderer/stores/atoms";
import { showFailureToast } from "@renderer/utilities/failures";
import { patchSettings } from "@renderer/utilities/persistSettings";
import {
  InstanceLibraryUnreadableError,
  readVerions,
} from "@renderer/utilities/version";
import {
  pickLastPlayedInstance,
  resolveBootstrapLanguage,
} from "./bootstrapPlan";
import { migrateInstanceConfs } from "./migrateInstanceConfs";

const api = window.api;

async function loadSettings(launcherPath: string): Promise<TSettings> {
  const store = getDefaultStore();
  const systemLocale: string = await api.other.getLocale();
  const settingsConfPath = await api.path.join(launcherPath, "settings.json");

  let rawData: Partial<TSettings> | null = null;
  if (await api.fs.pathExists(settingsConfPath)) {
    try {
      rawData = await api.fs.readJSON(settingsConfPath, "utf-8");
    } catch {
      rawData = null;
    }
  }

  const data = normalizeSettings(
    rawData,
    resolveBootstrapLanguage(systemLocale, i18n.language),
  );
  if (rawData === null) {
    await api.fs.writeJSON(settingsConfPath, data);
  }

  store.set(settingsAtom, data);
  await changeAppLanguage(data.lang);
  return data;
}

export async function runBootstrap(
  isCancelled: () => boolean,
): Promise<void> {
  const store = getDefaultStore();

  try {
    const paths = await api.other.getPaths();
    if (isCancelled()) return;

    store.set(pathsAtom, paths);

    const [settingsData] = await Promise.all([
      loadSettings(paths.launcher),
      loadAccounts(),
      hydrateInstancesFile(paths.launcher),
    ]);
    if (isCancelled()) return;

    const legacyViewPatch = migrateInstancesViewPrefs(
      settingsData,
      readLegacyViewPrefs(),
    );
    if (legacyViewPatch) {
      await patchSettings(legacyViewPatch).catch(() => {});
    }
    forgetLegacyViewPrefs();

    const versionsPath = await api.path.join(paths.minecraft, "versions");

    await api.fs.ensure(versionsPath);

    try {
      const instances = await readVerions(
        paths.launcher,
        store.get(accountAtom) ?? null,
      );
      await migrateInstanceConfs(paths.launcher, instances).catch(() => 0);
      if (!isCancelled()) {
        store.set(versionsUnreadableAtom, null);
        store.set(versionsAtom, instances);

        const lastPlayed = pickLastPlayedInstance(instances);
        if (lastPlayed && !store.get(selectedVersionAtom)) {
          store.set(selectedVersionAtom, lastPlayed);
        }
      }
    } catch (error) {
      console.error("[versions] failed to read the instance library", error);
      if (!isCancelled()) {
        store.set(
          versionsUnreadableAtom,
          error instanceof InstanceLibraryUnreadableError
            ? error.reason
            : i18n.t("versions.libraryUnreadableHint"),
        );
      }
    }

    if (isCancelled()) return;

    await checkWhatsNewAfterInit(paths.launcher, settingsData.lang);
  } catch (err) {
    console.error("Init error:", err);
    if (!isCancelled()) {
      showFailureToast(i18n.t("app.initError"), err);
    }
  } finally {
    if (!isCancelled()) store.set(versionsLoadedAtom, true);
  }
}
