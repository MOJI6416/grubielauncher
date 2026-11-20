let available: boolean | null = null;

export function webglAvailable(): boolean {
  if (available !== null) return available;
  try {
    available = !!document.createElement("canvas").getContext("webgl2");
  } catch {
    available = false;
  }
  return available;
}
