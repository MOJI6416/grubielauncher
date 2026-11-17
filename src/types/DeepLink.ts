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
    };
