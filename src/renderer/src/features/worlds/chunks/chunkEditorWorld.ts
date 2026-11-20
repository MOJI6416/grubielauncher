import { atom } from "jotai";

export interface ChunkEditorWorld {
  instanceId: string;
  folder: string;
  name: string;
}

export const chunkEditorWorldAtom = atom<ChunkEditorWorld | null>(null);
