import { atom } from "jotai";
import type { CompanionSession } from "@/shared/companion";

export const companionSessionsAtom = atom<CompanionSession[]>([]);
