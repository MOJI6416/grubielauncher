import { getDefaultStore } from "jotai";
import type { Version } from "@renderer/classes/Version";
import {
  accountAtom,
  isRunningAtom,
  selectedVersionAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { currentRouteAtom } from "@renderer/navigation/store";
import { instanceKey } from "@renderer/features/instances/selectors";
import { runGame } from "@renderer/features/launch/runGame";

export function currentInstance(): Version | undefined {
  const store = getDefaultStore();
  const route = store.get(currentRouteAtom);
  if (route.name === "instance" || route.name === "chunks") {
    return store
      .get(versionsAtom)
      .find((version) => instanceKey(version) === route.id);
  }
  return store.get(selectedVersionAtom);
}

export function canPlayNow(): boolean {
  const store = getDefaultStore();
  return !!store.get(accountAtom) && !store.get(isRunningAtom);
}

export function playInstance(version: Version | undefined): boolean {
  if (!version || !canPlayNow()) return false;
  void runGame({ version });
  return true;
}
