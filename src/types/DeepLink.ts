import type { Provider } from "./ModManager";

export type CatalogLinkTarget = "project" | "version" | "modpack";

export interface CatalogLink {
  provider: Provider.MODRINTH | Provider.CURSEFORGE;
  target: CatalogLinkTarget;
  id: string;
  fileId?: string;
}

export type LauncherDeepLink =
  | {
      type: "pack";
      shareCode: string;
    }
  | {
      type: "launch";
      versionName: string;
      instance: number;
      world?: string;
      server?: string;
      signature?: string;
      confirm?: boolean;
    }
  | {
      type: "groupJoin";
      code: string;
    }
  | {
      type: "skin";
      id: string;
    }
  | {
      type: "theme";
      id: string;
    }
  | {
      type: "friend";
      userId: string;
    }
  | {
      type: "webLogin";
      requestId: string;
    }
  | ({ type: "catalog" } & CatalogLink);
