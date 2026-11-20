export type InstanceStatusKind = "running" | "broken" | "update";

export interface InstanceStatusInput {
  running?: boolean;
  installed?: boolean;
  update?: string;
}

export function resolveInstanceStatuses(
  input: InstanceStatusInput,
): InstanceStatusKind[] {
  const statuses: InstanceStatusKind[] = [];

  if (input.running) statuses.push("running");
  if (input.installed === false) statuses.push("broken");
  if (input.update === "behind") statuses.push("update");

  return statuses;
}
