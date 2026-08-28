import { IVersionStatistics } from "@/types/VersionStatistics";
import { Version } from "@renderer/classes/Version";

const api = window.api;

export interface InstanceStatisticsRead {
  statistics: IVersionStatistics | null;
  failed: boolean;
}

export async function readInstanceStatistics(
  instance: Version,
): Promise<InstanceStatisticsRead> {
  try {
    const path = await api.path.join(instance.versionPath, "statistics.json");
    if (!(await api.fs.pathExists(path))) {
      return { statistics: null, failed: false };
    }

    const data = await api.fs.readJSON<IVersionStatistics>(path, "utf-8");
    return data
      ? { statistics: data, failed: false }
      : { statistics: null, failed: true };
  } catch {
    return { statistics: null, failed: true };
  }
}
