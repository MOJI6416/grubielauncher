import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_GROUPS, type ModGroupsFile, parseGroupsFile } from "./modGroups";

const api = window.api;

function groupsPaths(instancePath: string) {
  const folder = api.path.join(instancePath, "storage");
  return { folder, file: api.path.join(folder, "mod-groups.json") };
}

export function useModGroups(instancePath: string | undefined): {
  groups: ModGroupsFile;
  updateGroups: (change: (file: ModGroupsFile) => ModGroupsFile) => Promise<boolean>;
} {
  const [groups, setGroups] = useState<ModGroupsFile>(EMPTY_GROUPS);
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  useEffect(() => {
    setGroups(EMPTY_GROUPS);
    if (!instancePath) return;

    let cancelled = false;
    const { file } = groupsPaths(instancePath);

    void (async () => {
      const raw = (await api.fs.pathExists(file))
        ? await api.fs.readJSON(file).catch(() => null)
        : null;
      if (!cancelled) setGroups(parseGroupsFile(raw));
    })();

    return () => {
      cancelled = true;
    };
  }, [instancePath]);

  const updateGroups = useCallback(
    async (change: (file: ModGroupsFile) => ModGroupsFile) => {
      if (!instancePath) return false;

      const next = change(groupsRef.current);
      groupsRef.current = next;
      setGroups(next);

      const { folder, file } = groupsPaths(instancePath);
      const saved =
        (await api.fs.ensure(folder).catch(() => false)) &&
        (await api.fs.writeJSON(file, next).catch(() => false));
      return saved;
    },
    [instancePath],
  );

  return { groups, updateGroups };
}
