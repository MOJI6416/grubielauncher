import { check, handleSafe } from "../utilities/ipc";
import {
  applyCatalogProtocols,
  restoreCatalogProtocols,
} from "../utilities/catalogProtocols";

export function registerCatalogLinksIpc() {
  handleSafe<boolean, [boolean]>(
    "app:setCatalogLinks",
    false,
    [check.boolean()],
    async (_event, enabled: boolean) => applyCatalogProtocols(enabled),
  );

  void restoreCatalogProtocols().catch((error) =>
    console.warn("Failed to restore catalog link handlers:", error),
  );
}
