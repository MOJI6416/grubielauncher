import path from "path";
import { randomUUID } from "crypto";
import fs from "fs-extra";
import { TrashReason } from "@/types/ModManager";
import { mutateJsonAtomic } from "../utilities/atomicJson";

export const TRASH_REASONS_FILE = "reasons.json";

const REASONS = new Set<TrashReason>(["updated", "removed", "foreign"]);

export function fileStem(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.disabled$/, "")
    .replace(/\.(jar|zip)$/, "")
    .replace(/[^a-z]+/g, "");
}

async function recordReasons(
  trashPath: string,
  entries: { raw: string; reason: TrashReason }[],
): Promise<void> {
  if (entries.length === 0) return;

  await mutateJsonAtomic<Record<string, TrashReason>>(
    path.join(trashPath, TRASH_REASONS_FILE),
    async (current) => {
      const present = new Set(await fs.readdir(trashPath).catch(() => []));
      const next: Record<string, TrashReason> = {};

      for (const [raw, reason] of Object.entries(current ?? {})) {
        if (present.has(raw) && REASONS.has(reason)) next[raw] = reason;
      }
      for (const entry of entries) next[entry.raw] = entry.reason;

      return next;
    },
  ).catch((error) => {
    console.error(
      `[mods:trash] could not record why ${entries.length} file(s) went to ${trashPath}:`,
      error,
    );
  });
}

export async function moveFilesToTrash(
  trashPath: string,
  files: string[],
  reasonOf?: (file: string) => TrashReason,
): Promise<string[]> {
  if (files.length === 0) return [];

  try {
    await fs.ensureDir(trashPath);
  } catch (error) {
    console.error(
      `[mods:trash] kept ${files.length} file(s) in place: the quarantine folder ${trashPath} is not usable:`,
      error,
    );
    return [];
  }

  const moved: string[] = [];
  const reasons: { raw: string; reason: TrashReason }[] = [];

  await Promise.all(
    files.map(async (file) => {
      const raw = `${Date.now()}-${randomUUID().slice(0, 8)}-${path.basename(file)}`;
      const target = path.join(trashPath, raw);

      try {
        await fs.move(file, target, { overwrite: true });
        moved.push(path.basename(file));
        if (reasonOf) reasons.push({ raw, reason: reasonOf(file) });
      } catch (error) {
        console.error(
          `[mods:trash] kept ${file} in place: moving it to the quarantine failed:`,
          error,
        );
      }
    }),
  );

  await recordReasons(trashPath, reasons);

  return moved;
}
