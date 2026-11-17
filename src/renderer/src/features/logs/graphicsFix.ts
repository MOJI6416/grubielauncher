import { setOverride } from "@/shared/instanceSettings";
import type { ToolResult } from "@renderer/agent/types";

export async function switchInstanceToOpenGl(
  instance: string,
): Promise<ToolResult> {
  const [{ findInstance }, { refreshVersions, saveInstance }] =
    await Promise.all([
      import("@renderer/agent/tools/instances"),
      import("@renderer/agent/tools/shared"),
    ]);

  const version = findInstance(instance);
  if (!version) return { ok: false, error: `No instance named "${instance}"` };

  const conf = version.version;
  const previous = conf.overrides;
  conf.overrides = setOverride(previous, "graphicsBackend", "opengl");

  const saveError = await saveInstance(version);
  if (saveError) {
    conf.overrides = previous;
    return { ok: false, error: saveError };
  }

  refreshVersions();
  return {
    ok: true,
    undo: {
      op: "overrides",
      instance: conf.name,
      values: { graphicsBackend: previous?.graphicsBackend ?? null },
    },
  };
}
