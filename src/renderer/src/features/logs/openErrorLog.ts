import { navigate } from "@renderer/navigation/navigate";
import { countFeature } from "@renderer/features/usage/usage";

export const ERROR_LOG_ROUTE = {
  name: "settings",
  section: "support",
  view: "errors",
} as const;

export function openErrorLog(): boolean {
  countFeature("support.errorLog");
  return navigate(ERROR_LOG_ROUTE);
}
