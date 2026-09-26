export type AppUpdateState =
  | { status: "idle" }
  | { status: "downloading"; version: string }
  | { status: "ready"; version: string };
