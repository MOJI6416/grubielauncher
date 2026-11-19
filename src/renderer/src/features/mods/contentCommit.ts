import type { ILocalProject } from "@/types/ModManager";
import type { ModrinthDownloadReason } from "@/shared/modrinthDownloadMeta";

export interface ContentCommit {
  title: string;
  description?: string;
  tone?: "success" | "warning";
  failTitle: string;
  sync?: boolean;
  restoreFromTrash?: boolean;
  undo?: false | (() => void | Promise<void>);
  downloadReasons?: Record<string, ModrinthDownloadReason>;
}

export type CommitMods = (
  next: ILocalProject[],
  commit: ContentCommit,
) => Promise<boolean>;
