import type { OptiFineChoice } from "../shared/optifine";

export type OptiFineImportError = "wrongVersion" | "invalid" | "failed";

export type OptiFineImportResult =
  | { choice: OptiFineChoice; error?: undefined }
  | { error: OptiFineImportError; choice?: undefined };
