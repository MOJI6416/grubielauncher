import type { ILocalProject } from "@/types/ModManager";
import { entryKey } from "@renderer/features/mods/entries";
import { analyzePort, type PortTarget } from "@renderer/features/port/analyzePort";
import type { PortItem } from "@renderer/features/port/portPlan";
import {
  buildInstalledIndex,
  findInstalledProject,
} from "@renderer/utilities/mod";
import { type IModSet, setAsProjects } from "./modSets";

export async function resolveModSet(
  set: IModSet,
  target: PortTarget,
  installed: ILocalProject[],
): Promise<PortItem[]> {
  const index = buildInstalledIndex(installed);
  const present: PortItem[] = [];
  const wanted: ILocalProject[] = [];

  for (const project of setAsProjects(set)) {
    if (findInstalledProject(index, project)) {
      present.push({
        key: entryKey(project.provider, project.id),
        title: project.title,
        projectType: project.projectType,
        status: "installed",
      });
    } else {
      wanted.push(project);
    }
  }

  const items =
    wanted.length > 0
      ? await analyzePort("", wanted, target, {
          includeWorlds: false,
          installed,
        })
      : [];

  return [...items, ...present];
}
