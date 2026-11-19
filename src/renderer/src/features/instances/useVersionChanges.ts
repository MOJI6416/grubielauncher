import { useMemo } from "react";
import { Version } from "@renderer/classes/Version";
import { IArguments } from "@/types/IArguments";
import type { InstanceSettingsOverrides } from "@/shared/instanceSettings";
import { collectInstanceChanges } from "@renderer/features/instances/instanceOverview";

export function useVersionChanges({
  version,
  runArguments,
  isLogoChanged,
  overrides,
  savedRevision,
}: {
  version: Version | undefined;
  runArguments: IArguments;
  isLogoChanged: boolean;
  overrides: InstanceSettingsOverrides | undefined;
  savedRevision: number;
}) {
  const changeKinds = useMemo(
    () =>
      version
        ? collectInstanceChanges({
            draftArguments: runArguments,
            currentArguments: version.version.runArguments,
            draftOverrides: overrides,
            currentOverrides: version.version.overrides,
            isLogoChanged,
          })
        : [],
    [
      version,
      runArguments.game,
      runArguments.jvm,
      isLogoChanged,
      overrides,
      savedRevision,
    ],
  );

  return {
    hasChanges: changeKinds.length > 0,
    changeKinds,
  };
}
