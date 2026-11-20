export type AppUpdateState =
  | { status: "idle" }
  | { status: "downloading"; version: string }
  | { status: "ready"; version: string };

export type AppUpdateCheckResult =
  | { status: "unsupported" }
  | { status: "upToDate" }
  | { status: "downloading"; version: string }
  | { status: "ready"; version: string }
  | { status: "rejected"; version: string }
  | { status: "failed"; message: string };
