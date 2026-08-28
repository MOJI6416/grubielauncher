import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { Version } from "@renderer/classes/Version";
import { instanceKey } from "./selectors";
import {
  consumeUpdateDetailsRequest,
  instanceUpdateSummariesAtom,
} from "./updateCheck";

export function useInstanceUpdateDetails(version: Version | undefined) {
  const summaries = useAtomValue(instanceUpdateSummariesAtom);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!version) return;
    if (!consumeUpdateDetailsRequest(instanceKey(version))) return;

    setIsOpen(true);
  }, [version, summaries]);

  return {
    summary: version ? summaries[instanceKey(version)] : undefined,
    isOpen,
    toggle: () => setIsOpen((value) => !value),
    close: () => setIsOpen(false),
  };
}
