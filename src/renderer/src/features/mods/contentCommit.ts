import type { ILocalProject } from "@/types/ModManager";

export interface ContentCommit {
  title: string;
  description?: string;
  tone?: "success" | "warning";
  failTitle: string;
  sync?: boolean;
  restoreFromTrash?: boolean;
  undo?: false | (() => void | Promise<void>);
}

export type CommitMods = (
  next: ILocalProject[],
  commit: ContentCommit,
) => Promise<boolean>;
