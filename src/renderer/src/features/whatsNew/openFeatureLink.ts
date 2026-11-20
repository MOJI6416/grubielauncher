import { getDefaultStore } from "jotai";
import { selectedVersionAtom } from "@renderer/stores/atoms";
import { instanceKey } from "@renderer/features/instances/selectors";
import { navigate } from "@renderer/navigation/navigate";
import { openSettingsEntry } from "@renderer/features/settings/settingsFocus";
import type { FeatureLink } from "./featureLinks";

export function canOpenFeatureLink(link: FeatureLink): boolean {
  if (link.kind !== "instance") return true;
  return Boolean(getDefaultStore().get(selectedVersionAtom));
}

export function openFeatureLink(link: FeatureLink): boolean {
  if (link.kind === "setting") return openSettingsEntry(link.id);
  if (link.kind === "route") return navigate(link.route);

  const selected = getDefaultStore().get(selectedVersionAtom);
  if (!selected) return false;
  return navigate({
    name: "instance",
    id: instanceKey(selected),
    tab: link.tab,
  });
}
