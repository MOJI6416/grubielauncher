export type PublishFieldId =
  | "name"
  | "logo"
  | "mods"
  | "servers"
  | "options"
  | "arguments"
  | "world"
  | "other";

export type PublishMode = "new" | "update";

export type PublishStage =
  | "creatingShare"
  | "uploadingMods"
  | "preparingArchive"
  | "archivingOther"
  | "uploadingOther"
  | "uploadingLogo"
  | "publishing"
  | "saving"
  | "completed"
  | "error";

export const MAX_OTHER_BYTES = 1_000_000_000;
export const MAX_OTHER_ARCHIVE_BYTES = 512 * 1024 * 1024;

export type PublishSelection = Record<PublishFieldId, boolean>;

export interface PublishField {
  id: PublishFieldId;
  available: boolean;
}

export interface PublishAvailabilityInput {
  mode: PublishMode;
  diff: string;
  modsCount: number;
  serversCount: number;
  hasOptionsFile: boolean;
  hasArguments: boolean;
  isOtherSelected: boolean;
  hasWorlds: boolean;
  publishedHasWorld: boolean;
}

const UPDATE_FIELDS: PublishFieldId[] = [
  "name",
  "logo",
  "mods",
  "servers",
  "options",
  "arguments",
  "world",
  "other",
];

const NEW_FIELDS: PublishFieldId[] = [
  "mods",
  "servers",
  "options",
  "arguments",
  "world",
  "other",
];

const DIFF_KEY: Record<PublishFieldId, string> = {
  name: "name",
  logo: "logo",
  mods: "mods",
  servers: "servers",
  options: "options",
  arguments: "arguments",
  world: "world",
  other: "other",
};

export function emptyPublishSelection(): PublishSelection {
  return {
    name: false,
    logo: false,
    mods: false,
    servers: false,
    options: false,
    arguments: false,
    world: false,
    other: false,
  };
}

export function getPublishFields(
  input: PublishAvailabilityInput,
): PublishField[] {
  const ids = input.mode === "new" ? NEW_FIELDS : UPDATE_FIELDS;

  return ids.map((id) => ({ id, available: isFieldAvailable(id, input) }));
}

function isFieldAvailable(
  id: PublishFieldId,
  input: PublishAvailabilityInput,
): boolean {
  if (id === "world") return input.hasWorlds || input.publishedHasWorld;

  if (input.mode === "update") {
    if (id === "other") {
      return input.diff.includes(DIFF_KEY.other) || input.isOtherSelected;
    }
    return input.diff.includes(DIFF_KEY[id]);
  }

  switch (id) {
    case "mods":
      return input.modsCount > 0;
    case "servers":
      return input.serversCount > 0;
    case "options":
      return input.hasOptionsFile;
    case "arguments":
      return input.hasArguments;
    case "other":
      return true;
    default:
      return false;
  }
}

export function pickNewPublishDefaults(
  fields: PublishField[],
  alreadyDefaulted: ReadonlySet<PublishFieldId>,
): PublishFieldId[] {
  return fields
    .filter(
      (field) =>
        field.available &&
        field.id !== "other" &&
        field.id !== "world" &&
        !alreadyDefaulted.has(field.id),
    )
    .map((field) => field.id);
}

export function samePaths(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const set = new Set(right);
  return left.every((item) => set.has(item));
}

export type PublishReadiness = "ready" | "nothingSelected" | "noChanges";

export function publishReadiness({
  mode,
  diff,
  selection,
  publishedOtherPaths,
  publishedOtherSize,
  nextOtherPaths,
  nextOtherSize,
  publishedHasWorld,
  isCatalogPublicChanged,
  isDescriptionChanged,
  selectedCount,
}: {
  mode: PublishMode;
  diff: string;
  selection: PublishSelection;
  publishedOtherPaths: string[];
  publishedOtherSize: number;
  nextOtherPaths: string[];
  nextOtherSize: number;
  publishedHasWorld: boolean;
  isCatalogPublicChanged: boolean;
  isDescriptionChanged: boolean;
  selectedCount: number;
}): PublishReadiness {
  if (mode === "new") return "ready";

  const otherChanged = isArchiveChanged({
    selection,
    publishedOtherPaths,
    publishedOtherSize,
    nextOtherPaths,
    nextOtherSize,
    publishedHasWorld,
  });

  const hasChanges =
    diff.trim() !== "" ||
    isCatalogPublicChanged ||
    isDescriptionChanged ||
    otherChanged;

  if (!hasChanges) return "noChanges";
  if (selectedCount === 0) return "nothingSelected";

  return "ready";
}

// The world and the extra files travel in one archive, so "has the archive
// changed" is one question for both — and the world is no longer named in
// `paths` (an older launcher would seed its file picker from that and re-upload
// the world by the route that skips the privacy pass), so its own toggle is
// what says it changed.
function isArchiveChanged({
  selection,
  publishedOtherPaths,
  publishedOtherSize,
  nextOtherPaths,
  nextOtherSize,
  publishedHasWorld,
}: {
  selection: PublishSelection;
  publishedOtherPaths: string[];
  publishedOtherSize: number;
  nextOtherPaths: string[];
  nextOtherSize: number;
  publishedHasWorld: boolean;
}): boolean {
  if (!selection.other && !selection.world) return false;

  return (
    nextOtherSize !== publishedOtherSize ||
    !samePaths(publishedOtherPaths, nextOtherPaths) ||
    selection.world !== publishedHasWorld
  );
}

export type PublishSummaryItem = PublishFieldId | "description" | "visibility";

export function summarizePublish({
  mode,
  fields,
  selection,
  publishedOtherPaths,
  publishedOtherSize,
  nextOtherPaths,
  nextOtherSize,
  publishedHasWorld,
  isCatalogPublicChanged,
  isDescriptionChanged,
}: {
  mode: PublishMode;
  fields: PublishField[];
  selection: PublishSelection;
  publishedOtherPaths: string[];
  publishedOtherSize: number;
  nextOtherPaths: string[];
  nextOtherSize: number;
  publishedHasWorld: boolean;
  isCatalogPublicChanged: boolean;
  isDescriptionChanged: boolean;
}): PublishSummaryItem[] {
  const otherChanged =
    mode === "new" ||
    nextOtherSize !== publishedOtherSize ||
    !samePaths(publishedOtherPaths, nextOtherPaths) ||
    selection.world !== publishedHasWorld;

  const items: PublishSummaryItem[] = [];

  for (const field of fields) {
    if (!field.available || !selection[field.id]) continue;
    if ((field.id === "other" || field.id === "world") && !otherChanged)
      continue;
    items.push(field.id);
  }

  if (isDescriptionChanged) items.push("description");
  if (isCatalogPublicChanged) items.push("visibility");

  return items;
}

const STAGE_PERCENT: Record<PublishStage, number> = {
  creatingShare: 5,
  uploadingMods: 15,
  preparingArchive: 25,
  archivingOther: 35,
  uploadingOther: 45,
  uploadingLogo: 82,
  publishing: 92,
  saving: 97,
  completed: 100,
  error: 100,
};

export function publishStagePercent(stage: PublishStage): number {
  return STAGE_PERCENT[stage];
}

export function uploadStagePercent(uploadPercent: number): number {
  const clamped = Math.min(100, Math.max(0, uploadPercent));
  return STAGE_PERCENT.uploadingOther + Math.round(clamped * 0.35);
}

export type PublishErrorCode =
  | "payloadTooLarge"
  | "limitExceeded"
  | "sourceTooLarge"
  | "sizeUnknown"
  | "uploadFailed"
  | "logoFailed"
  | "generic";

export function resolvePublishErrorCode(error: unknown): PublishErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "payload_too_large") return "payloadTooLarge";
  if (message === "limit_exceeded") return "limitExceeded";
  if (message === "source_too_large") return "sourceTooLarge";
  if (message === "size_unknown") return "sizeUnknown";
  if (message === "upload_failed") return "uploadFailed";
  if (message === "logo_failed") return "logoFailed";
  return "generic";
}

export function isOtherOverLimit(totalBytes: number): boolean {
  return totalBytes > MAX_OTHER_BYTES;
}

export function orphanedPublishUploads({
  isRemoteCommitted,
  otherUrl,
  imageUrl,
}: {
  isRemoteCommitted: boolean;
  otherUrl: string | null;
  imageUrl: string | null;
}): string[] {
  if (isRemoteCommitted) return [];
  return [otherUrl, imageUrl].filter((url): url is string => !!url);
}
