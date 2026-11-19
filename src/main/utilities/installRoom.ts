import path from "path";
import type { DiskRoom } from "@/types/DiskRoom";
import { measureTree, nearestExistingDir } from "./dataMove";
import { getFreeBytes, hasRoomFor } from "./diskSpace";

export async function checkInstallRoom(
  target: string,
  bytes: number,
  measureRoots: string[] = [],
): Promise<DiskRoom> {
  const measured = await Promise.all(measureRoots.map((root) => measureTree(root)));
  const neededBytes =
    Math.max(0, Math.round(bytes)) + measured.reduce((sum, size) => sum + size, 0);
  const anchor = await nearestExistingDir(target);
  const freeBytes = await getFreeBytes(anchor);

  return {
    ok: hasRoomFor(freeBytes, neededBytes),
    freeBytes,
    neededBytes,
    drive: path.parse(anchor).root || anchor,
  };
}
