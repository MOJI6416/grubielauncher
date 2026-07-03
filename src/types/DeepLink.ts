export type LauncherDeepLink =
  | {
      type: "pack";
      shareCode: string;
    }
  | {
      type: "launch";
      versionName: string;
      instance: number;
    }
  | {
      type: "groupJoin";
      code: string;
    };
