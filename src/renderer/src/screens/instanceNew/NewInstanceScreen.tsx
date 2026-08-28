import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { pathsAtom } from "@renderer/stores/atoms";
import { navigate } from "@renderer/navigation/navigate";
import { restoreFocusOrigin } from "@renderer/navigation/focusReturn";
import { clearLauncherTemp } from "@renderer/features/instances/launcherTemp";
import {
  clearNewInstanceRequest,
  newInstanceRequestAtom,
} from "@renderer/features/instances/newInstance";
import { NewInstancePanel } from "@renderer/features/newInstance/NewInstancePanel";

export function NewInstanceScreen() {
  const paths = useAtomValue(pathsAtom);
  const request = useAtomValue(newInstanceRequestAtom);

  useEffect(() => {
    return () => restoreFocusOrigin();
  }, []);

  return (
    <NewInstancePanel
      importFilePath={request.importFilePath}
      modpack={request.modpack}
      source={request.source}
      successCallback={request.onSuccess}
      closeModal={async () => {
        clearNewInstanceRequest();
        navigate({ name: "home" }, { force: true, replace: true });
        await clearLauncherTemp(paths.launcher);
      }}
    />
  );
}
