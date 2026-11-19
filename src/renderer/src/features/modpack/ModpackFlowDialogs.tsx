import type { Loader } from "@/types/Loader";
import { BlockedMods } from "@renderer/components/Modals/BlockedMods";
import type { ModpackUpdateFlow } from "./useModpackUpdateFlow";

export function ModpackFlowDialogs({
  flow,
  gameVersion,
  loader,
}: {
  flow: ModpackUpdateFlow;
  gameVersion: string;
  loader: Loader;
}) {
  return (
    <>
      {flow.blockedPack && (
        <BlockedMods
          mods={[flow.blockedPack.blocked]}
          onClose={flow.resolveBlockedPack}
        />
      )}

      {flow.blockedMods && (
        <BlockedMods
          mods={flow.blockedMods}
          mcVersion={gameVersion}
          loader={loader}
          onClose={flow.resolveBlockedMods}
        />
      )}
    </>
  );
}
