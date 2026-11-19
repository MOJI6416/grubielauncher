import i18n from "@renderer/i18n";
import { classifyError } from "@/shared/errors";
import { describeFailure } from "@renderer/utilities/failures";
import {
  INSTANCE_CONTENT_FAILED,
  INSTANCE_FOLDER_EXISTS,
} from "@renderer/features/newInstance/createInstance";

export class ImportStepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportStepError";
  }
}

export function describeImportFailure(error: unknown): string {
  if (error instanceof ImportStepError) return error.message;
  const message = error instanceof Error ? error.message : "";
  if (message === INSTANCE_FOLDER_EXISTS) return i18n.t("newInstance.name.folderTaken");
  if (message === INSTANCE_CONTENT_FAILED) return i18n.t("newInstance.contentFailed");
  return describeFailure(classifyError(error, {})).reason;
}
