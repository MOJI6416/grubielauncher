import i18n from "@renderer/i18n";
import type { DiskRoom } from "@/types/DiskRoom";
import { formatBytes } from "./file";
import { showErrorToast } from "./errorToast";

export { contentBytes } from "@/shared/installBytes";

export const NOT_ENOUGH_SPACE = "NOT_ENOUGH_SPACE";

export class NotEnoughSpaceError extends Error {
  constructor(readonly room: DiskRoom) {
    super(NOT_ENOUGH_SPACE);
    this.name = "NotEnoughSpaceError";
  }
}

export function isNotEnoughSpace(error: unknown): error is NotEnoughSpaceError {
  return error instanceof NotEnoughSpaceError;
}

export async function ensureDiskRoom(
  target: string,
  bytes: number,
  measureRoots: string[] = [],
): Promise<void> {
  const room = await window.api.modpack.checkRoom(target, bytes, measureRoots);
  if (room && !room.ok) throw new NotEnoughSpaceError(room);
}

function sizeUnits(): string[] {
  return [0, 1, 2, 3, 4].map((index) => i18n.t(`sizes.${index}`));
}

export function describeNotEnoughSpace(room: DiskRoom): string {
  const units = sizeUnits();
  const free = room.freeBytes ?? 0;

  return i18n.t("diskRoom.description", {
    drive: room.drive,
    needed: formatBytes(room.neededBytes, units, 1),
    free: formatBytes(free, units, 1),
  });
}

export function showNotEnoughSpaceToast(title: string, error: unknown): boolean {
  if (!isNotEnoughSpace(error)) return false;

  showErrorToast(title, describeNotEnoughSpace(error.room), "");
  return true;
}
