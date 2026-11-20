import type {
  OptiFineBuild,
  OptiFineChoice,
} from "@/shared/optifine";
import { isOptiFineChoice } from "@/shared/optifine";
import type { OptiFineImportResult } from "@/types/OptiFine";
import {
  OPTIFINE_INVALID_FILE,
  OPTIFINE_WRONG_VERSION,
  closeOptiFineDownload,
  fetchOptiFineBuilds,
  importOptiFineFile,
  obtainOptiFine,
  storedOptiFine,
} from "../game/optifine";
import { check, handleSafe } from "../utilities/ipc";
import { assertReadablePath } from "../utilities/safePath";

const isMinecraftVersion = check.pattern(/^\d+\.\d+(?:\.\d+)?$/, 16);
const isChoice = check.object();
const isPath = check.nonEmptyString(4096);

function assertChoice(value: unknown): OptiFineChoice {
  if (!isOptiFineChoice(value)) throw new Error("Invalid OptiFine choice");
  return { file: value.file, minecraft: value.minecraft, edition: value.edition };
}

export function registerOptiFineIpc() {
  handleSafe<OptiFineBuild[] | null>(
    "optifine:builds",
    null,
    [isMinecraftVersion, check.optional(check.boolean())],
    async (_, minecraft: string, force?: boolean) =>
      (await fetchOptiFineBuilds(!!force)).filter(
        (build) => build.minecraft === minecraft,
      ),
  );

  handleSafe<boolean>(
    "optifine:isStored",
    false,
    [isChoice],
    async (_, choice: OptiFineChoice) => !!(await storedOptiFine(assertChoice(choice))),
  );

  handleSafe<OptiFineChoice | null>(
    "optifine:obtain",
    null,
    [isChoice],
    async (_, choice: OptiFineChoice) => obtainOptiFine(assertChoice(choice)),
  );

  handleSafe("optifine:closeDownload", false, async () => {
    closeOptiFineDownload();
    return true;
  });

  handleSafe<OptiFineImportResult>(
    "optifine:import",
    { error: "failed" },
    [isPath, isMinecraftVersion],
    async (_, filePath: string, minecraft: string) => {
      assertReadablePath(filePath, "optifine:import");
      try {
        return { choice: await importOptiFineFile(filePath, minecraft) };
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code === OPTIFINE_WRONG_VERSION) return { error: "wrongVersion" };
        if (code === OPTIFINE_INVALID_FILE) return { error: "invalid" };
        throw error;
      }
    },
  );
}
