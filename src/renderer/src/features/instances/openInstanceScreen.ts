import type { ILocalAccount } from "@/types/Account";
import { Version } from "@renderer/classes/Version";
import { navigate } from "@renderer/navigation/navigate";
import type { InstanceTab } from "@renderer/navigation/routes";
import { morphTransition } from "@renderer/utilities/viewTransition";
import { selectInstance } from "./selectInstance";
import { instanceKey } from "./selectors";

export function openInstanceScreen(
  instance: Version,
  account: ILocalAccount | null | undefined,
  options: { tab?: InstanceTab; morphFrom?: string } = {},
): void {
  const update = () => {
    void selectInstance(instance, account);
    navigate({ name: "instance", id: instanceKey(instance), tab: options.tab });
  };

  if (!options.morphFrom || (options.tab && options.tab !== "overview")) {
    update();
    return;
  }

  morphTransition({
    source: `[data-morph="${CSS.escape(options.morphFrom)}"]`,
    target: "[data-morph-target]",
    update,
  });
}
