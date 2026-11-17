export const GRAPHICS_BACKENDS = ["opengl", "vulkan"] as const;

export type GraphicsBackend = (typeof GRAPHICS_BACKENDS)[number];

const CALENDAR_VERSION = /^(\d{2})\.(\d+)/;
const FIRST_YEAR = 26;
const FIRST_DROP = 2;

export function supportsGraphicsBackend(
  mcVersion: string | undefined,
): boolean {
  const match = CALENDAR_VERSION.exec(mcVersion ?? "");
  if (!match) return false;

  const year = Number(match[1]);
  const drop = Number(match[2]);
  return year > FIRST_YEAR || (year === FIRST_YEAR && drop >= FIRST_DROP);
}

export type GraphicsBackendReason = "choice" | "shaders";

export interface GraphicsBackendLaunch {
  backend: GraphicsBackend;
  reason: GraphicsBackendReason;
}

export function resolveGraphicsBackend(input: {
  mcVersion: string | undefined;
  choice: GraphicsBackend | null;
  shaderLoader: boolean;
}): GraphicsBackendLaunch | null {
  if (!supportsGraphicsBackend(input.mcVersion)) return null;
  if (input.shaderLoader) {
    return {
      backend: "opengl",
      reason: input.choice === "opengl" ? "choice" : "shaders",
    };
  }
  return input.choice ? { backend: input.choice, reason: "choice" } : null;
}

export function graphicsBackendArguments(
  launch: GraphicsBackendLaunch | null,
): string[] {
  return launch ? ["--graphicsBackend", launch.backend] : [];
}
