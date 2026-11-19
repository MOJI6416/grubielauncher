import { useState } from "react";
import { IArguments } from "@/types/IArguments";
import type { InstanceSettingsOverrides } from "@/shared/instanceSettings";
import { Version } from "@renderer/classes/Version";

const EMPTY_ARGUMENTS: IArguments = { game: "", jvm: "" };

export function useInstanceDraft(version: Version | undefined) {
  const [name, setName] = useState(() => version?.version.name ?? "");
  const [runArguments, setRunArguments] = useState<IArguments>(
    () => version?.version.runArguments || { ...EMPTY_ARGUMENTS },
  );
  const [image, setImage] = useState(() => version?.version.image ?? "");
  const [isLogoChanged, setIsLogoChanged] = useState(false);
  const [editName, setEditName] = useState(false);
  const [overrides, setOverrides] = useState<
    InstanceSettingsOverrides | undefined
  >(() => version?.version.overrides);

  function reset() {
    if (!version) return;

    setImage(version.version.image);
    setRunArguments(version.version.runArguments || { ...EMPTY_ARGUMENTS });
    setOverrides(version.version.overrides);
    setIsLogoChanged(false);
  }

  return {
    name,
    setName,
    runArguments,
    setRunArguments,
    image,
    setImage,
    isLogoChanged,
    setIsLogoChanged,
    editName,
    setEditName,
    overrides,
    setOverrides,
    reset,
  };
}
