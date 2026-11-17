import type { ModTranslationStatus } from "@/types/ModTranslations";
import { check, handleSafe } from "../utilities/ipc";
import { assertWritablePath } from "../utilities/safePath";
import {
  refreshModTranslations,
  setModTranslationEnabled,
} from "../game/modTranslations/sync";

const isPath = check.nonEmptyString(4096);
const isLang = check.pattern(/^[a-z]{2,3}$/, 3);
const isToken = check.optional(check.string(8192));

function fallbackStatus(versionPath: string): ModTranslationStatus {
  return {
    versionPath,
    enabled: false,
    locale: null,
    stage: "error",
    progress: null,
    mods: 0,
    packs: [],
    translated: 0,
    pending: 0,
    failed: 0,
    needsAccount: false,
    error: "internal",
    updatedAt: null,
  };
}

export function registerModTranslationsIpc() {
  handleSafe<ModTranslationStatus, [string, string, string?]>(
    "modTranslations:status",
    (versionPath) => fallbackStatus(versionPath),
    [isPath, isLang, isToken],
    async (_, versionPath, launcherLang, token) => {
      assertWritablePath(versionPath, "modTranslations:status");
      return refreshModTranslations(versionPath, { launcherLang, token });
    },
  );

  handleSafe<ModTranslationStatus, [string, boolean, string, string?]>(
    "modTranslations:setEnabled",
    (versionPath) => fallbackStatus(versionPath),
    [isPath, check.boolean(), isLang, isToken],
    async (_, versionPath, enabled, launcherLang, token) => {
      assertWritablePath(versionPath, "modTranslations:setEnabled");
      return setModTranslationEnabled(versionPath, enabled, {
        launcherLang,
        token,
      });
    },
  );
}
