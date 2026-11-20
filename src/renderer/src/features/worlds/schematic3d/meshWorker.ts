import {
  CompiledModels,
  LayerRange,
  SectionMesh,
  VolumeGrid,
  countLayerQuads,
  meshSection,
} from "./mesher";

export type MeshRequest =
  | { type: "init"; grid: VolumeGrid; models: CompiledModels }
  | { type: "build"; generation: number; range: LayerRange; sections: [number, number, number][] }
  | { type: "stop" };

export type MeshResponse =
  | { type: "counted"; layerQuads: Uint32Array; elapsed: number }
  | { type: "section"; generation: number; mesh: SectionMesh }
  | { type: "done"; generation: number; elapsed: number };

const scope = self as unknown as {
  postMessage(message: MeshResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<MeshRequest>) => void) | null;
};

let grid: VolumeGrid | null = null;
let models: CompiledModels | null = null;
let current = 0;

function transfers(mesh: SectionMesh): Transferable[] {
  const list: Transferable[] = [];
  for (const part of [mesh.opaque, mesh.translucent]) {
    if (!part) continue;
    list.push(part.positions.buffer, part.uvs.buffer, part.colors.buffer, part.indices.buffer);
  }
  return list;
}

function yieldTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function build(generation: number, range: LayerRange, sections: [number, number, number][]) {
  const started = performance.now();
  let budget = performance.now();
  for (const [x, y, z] of sections) {
    if (generation !== current || !grid || !models) return;
    const mesh = meshSection(grid, models, range, x, y, z);
    scope.postMessage({ type: "section", generation, mesh }, transfers(mesh));
    if (performance.now() - budget > 12) {
      await yieldTurn();
      budget = performance.now();
    }
  }
  if (generation === current) {
    scope.postMessage({ type: "done", generation, elapsed: performance.now() - started });
  }
}

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === "init") {
    grid = message.grid;
    models = message.models;
    current += 1;
    const started = performance.now();
    const layerQuads = countLayerQuads(grid, models);
    scope.postMessage({ type: "counted", layerQuads, elapsed: performance.now() - started }, [
      layerQuads.buffer,
    ]);
    return;
  }
  if (message.type === "build") {
    current = message.generation;
    void build(message.generation, message.range, message.sections);
    return;
  }
  current += 1;
  grid = null;
  models = null;
};
