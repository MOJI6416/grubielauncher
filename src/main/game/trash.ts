import path from "path";
import { randomUUID } from "crypto";
import fs from "fs-extra";

export async function moveFilesToTrash(
  trashPath: string,
  files: string[],
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

  await Promise.all(
    files.map(async (file) => {
      const target = path.join(
        trashPath,
        `${Date.now()}-${randomUUID().slice(0, 8)}-${path.basename(file)}`,
      );

      try {
        await fs.move(file, target, { overwrite: true });
        moved.push(path.basename(file));
      } catch (error) {
        console.error(
          `[mods:trash] kept ${file} in place: moving it to the quarantine failed:`,
          error,
        );
      }
    }),
  );

  return moved;
}
