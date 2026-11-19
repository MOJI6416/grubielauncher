import os from "os";
import path from "path";
import fs from "fs-extra";

export const FIXTURES = path.join(__dirname, "fixtures");

async function copyRenaming(source: string, target: string): Promise<void> {
  const stat = await fs.stat(source);
  if (!stat.isDirectory()) {
    await fs.copy(source, target);
    return;
  }
  await fs.ensureDir(target);
  for (const name of await fs.readdir(source)) {
    const renamed = name.startsWith("dot.") ? `.${name.slice(4)}` : name;
    await copyRenaming(path.join(source, name), path.join(target, renamed));
  }
}

export async function useFixture(name: string, into?: string): Promise<string> {
  const target = into ?? (await fs.mkdtemp(path.join(os.tmpdir(), `grubie-import-${name}-`)));
  await copyRenaming(path.join(FIXTURES, name), target);
  return target;
}

export async function tempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `grubie-import-${prefix}-`));
}

export async function buildSqlite(sqlFile: string, dbFile: string): Promise<void> {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(dbFile);
  try {
    db.exec(await fs.readFile(sqlFile, "utf-8"));
  } finally {
    db.close();
  }
}

export function escapeProperty(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
}
