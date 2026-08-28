export type InstanceStatusKind =
  | "running"
  | "broken"
  | "update"
  | "downloaded";

export interface InstanceStatusInput {
  running?: boolean;
  installed?: boolean;
  update?: string;
  downloaded?: boolean;
}

export function resolveInstanceStatuses(
  input: InstanceStatusInput,
): InstanceStatusKind[] {
  const statuses: InstanceStatusKind[] = [];

  if (input.running) statuses.push("running");
  if (input.installed === false) statuses.push("broken");
  if (input.update === "behind") statuses.push("update");
  if (input.downloaded && input.update !== "behind") statuses.push("downloaded");

  return statuses;
}
