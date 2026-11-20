export const SECTION = 16;

export const DIRECTION_OFFSETS: readonly (readonly [number, number, number])[] = [
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
  [-1, 0, 0],
  [1, 0, 0],
];

export const FACE_SHADE = [0.7, 1, 0.9, 0.9, 0.8, 0.8];

export interface CompiledModels {
  quadStart: Uint32Array;
  positions: Float32Array;
  uvs: Float32Array;
  colors: Uint8Array;
  cull: Int8Array;
  layer: Uint8Array;
  occludes: Uint8Array;
  selfCull: Uint8Array;
  liquid: Uint8Array;
  visible: Uint8Array;
}

export interface VolumeGrid {
  sx: number;
  sy: number;
  sz: number;
  yFrom: number;
  data: Uint16Array | Uint32Array;
}

export interface LayerRange {
  lo: number;
  hi: number;
}

export interface MeshPart {
  positions: Float32Array;
  uvs: Float32Array;
  colors: Uint8Array;
  indices: Uint16Array | Uint32Array;
}

export interface SectionMesh {
  key: string;
  x: number;
  y: number;
  z: number;
  quads: number;
  opaque: MeshPart | null;
  translucent: MeshPart | null;
}

export interface CompileQuad {
  positions: number[];
  uvs: number[];
  rect: readonly [number, number, number, number];
  cull: number;
  shade: number;
  tint: number;
  translucent: boolean;
}

export interface CompileBlock {
  quads: CompileQuad[];
  occludes: boolean;
  selfCull: boolean;
  liquid: number;
}

export function compileModels(blocks: CompileBlock[]): CompiledModels {
  const total = blocks.reduce((sum, block) => sum + block.quads.length, 0);
  const models: CompiledModels = {
    quadStart: new Uint32Array(blocks.length + 1),
    positions: new Float32Array(total * 12),
    uvs: new Float32Array(total * 8),
    colors: new Uint8Array(total * 3),
    cull: new Int8Array(total),
    layer: new Uint8Array(total),
    occludes: new Uint8Array(blocks.length),
    selfCull: new Uint8Array(blocks.length),
    liquid: new Uint8Array(blocks.length),
    visible: new Uint8Array(blocks.length),
  };

  let quad = 0;
  blocks.forEach((block, state) => {
    models.quadStart[state] = quad;
    models.occludes[state] = block.occludes ? 1 : 0;
    models.selfCull[state] = block.selfCull ? 1 : 0;
    models.liquid[state] = block.liquid;
    models.visible[state] = block.quads.length ? 1 : 0;
    for (const source of block.quads) {
      models.positions.set(source.positions.slice(0, 12), quad * 12);
      const [u0, v0, du, dv] = source.rect;
      for (let corner = 0; corner < 4; corner += 1) {
        models.uvs[quad * 8 + corner * 2] = u0 + (source.uvs[corner * 2] ?? 0) * du;
        models.uvs[quad * 8 + corner * 2 + 1] = v0 + (source.uvs[corner * 2 + 1] ?? 0) * dv;
      }
      const shade = source.shade >= 0 ? FACE_SHADE[source.shade] : 1;
      const tint = source.tint >= 0 ? source.tint : 0xffffff;
      models.colors[quad * 3] = Math.round(((tint >> 16) & 255) * shade);
      models.colors[quad * 3 + 1] = Math.round(((tint >> 8) & 255) * shade);
      models.colors[quad * 3 + 2] = Math.round((tint & 255) * shade);
      models.cull[quad] = source.cull;
      models.layer[quad] = source.translucent ? 1 : 0;
      quad += 1;
    }
  });
  models.quadStart[blocks.length] = quad;
  return models;
}

function stateAt(grid: VolumeGrid, range: LayerRange, x: number, y: number, z: number): number {
  if (x < 0 || z < 0 || x >= grid.sx || z >= grid.sz) return 0;
  if (y < range.lo || y > range.hi) return 0;
  const local = y - grid.yFrom;
  if (local < 0 || local >= grid.sy) return 0;
  return grid.data[x + z * grid.sx + local * grid.sx * grid.sz];
}

function hidden(
  models: CompiledModels,
  state: number,
  neighbor: number,
): boolean {
  if (neighbor === 0) return false;
  if (models.occludes[neighbor]) return true;
  if (models.selfCull[state] && neighbor === state) return true;
  return models.liquid[state] !== 0 && models.liquid[state] === models.liquid[neighbor];
}

function forEachQuad(
  grid: VolumeGrid,
  models: CompiledModels,
  range: LayerRange,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  visit: (quad: number, x: number, y: number, z: number, state: number, raise: boolean) => void,
) {
  for (let y = y0; y < y1; y += 1) {
    for (let z = z0; z < z1; z += 1) {
      for (let x = x0; x < x1; x += 1) {
        const state = stateAt(grid, range, x, y, z);
        if (state === 0 || !models.visible[state]) continue;
        const end = models.quadStart[state + 1];
        const liquid = models.liquid[state];
        const raise =
          liquid !== 0 && models.liquid[stateAt(grid, range, x, y + 1, z)] === liquid;
        for (let quad = models.quadStart[state]; quad < end; quad += 1) {
          const cull = models.cull[quad];
          if (cull >= 0) {
            const [dx, dy, dz] = DIRECTION_OFFSETS[cull];
            if (hidden(models, state, stateAt(grid, range, x + dx, y + dy, z + dz))) {
              continue;
            }
          }
          visit(quad, x, y, z, state, raise);
        }
      }
    }
  }
}

export function countLayerQuads(grid: VolumeGrid, models: CompiledModels): Uint32Array {
  const counts = new Uint32Array(grid.sy);
  const range = { lo: grid.yFrom, hi: grid.yFrom + grid.sy - 1 };
  forEachQuad(grid, models, range, 0, grid.yFrom, 0, grid.sx, grid.yFrom + grid.sy, grid.sz, (_, __, y) => {
    counts[y - grid.yFrom] += 1;
  });
  return counts;
}

function allocate(quads: number): MeshPart {
  const vertices = quads * 4;
  return {
    positions: new Float32Array(vertices * 3),
    uvs: new Float32Array(vertices * 2),
    colors: new Uint8Array(vertices * 3),
    indices: vertices > 65535 ? new Uint32Array(quads * 6) : new Uint16Array(quads * 6),
  };
}

export function sectionKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export function meshSection(
  grid: VolumeGrid,
  models: CompiledModels,
  range: LayerRange,
  sectionX: number,
  sectionY: number,
  sectionZ: number,
): SectionMesh {
  const x0 = sectionX * SECTION;
  const y0 = sectionY * SECTION;
  const z0 = sectionZ * SECTION;
  const x1 = Math.min(grid.sx, x0 + SECTION);
  const z1 = Math.min(grid.sz, z0 + SECTION);
  const yLow = Math.max(y0, range.lo, grid.yFrom);
  const yHigh = Math.min(y0 + SECTION, range.hi + 1, grid.yFrom + grid.sy);

  const counts = [0, 0];
  forEachQuad(grid, models, range, x0, yLow, z0, x1, yHigh, z1, (quad) => {
    counts[models.layer[quad]] += 1;
  });

  const parts = counts.map((count) => (count ? allocate(count) : null));
  const filled = [0, 0];
  forEachQuad(grid, models, range, x0, yLow, z0, x1, yHigh, z1, (quad, x, y, z, _state, raise) => {
    const layer = models.layer[quad];
    const part = parts[layer]!;
    const at = filled[layer]++;
    const base = at * 4;
    for (let corner = 0; corner < 4; corner += 1) {
      const source = quad * 12 + corner * 3;
      const target = (base + corner) * 3;
      let py = models.positions[source + 1];
      if (raise && py > 0.8 && py < 0.95) py = 1;
      part.positions[target] = x + models.positions[source];
      part.positions[target + 1] = y + py;
      part.positions[target + 2] = z + models.positions[source + 2];
      part.uvs[(base + corner) * 2] = models.uvs[quad * 8 + corner * 2];
      part.uvs[(base + corner) * 2 + 1] = models.uvs[quad * 8 + corner * 2 + 1];
      part.colors[target] = models.colors[quad * 3];
      part.colors[target + 1] = models.colors[quad * 3 + 1];
      part.colors[target + 2] = models.colors[quad * 3 + 2];
    }
    const index = at * 6;
    part.indices[index] = base;
    part.indices[index + 1] = base + 1;
    part.indices[index + 2] = base + 2;
    part.indices[index + 3] = base;
    part.indices[index + 4] = base + 2;
    part.indices[index + 5] = base + 3;
  });

  return {
    key: sectionKey(sectionX, sectionY, sectionZ),
    x: sectionX,
    y: sectionY,
    z: sectionZ,
    quads: counts[0] + counts[1],
    opaque: parts[0],
    translucent: parts[1],
  };
}

export function sectionsInRange(grid: VolumeGrid, range: LayerRange): [number, number, number][] {
  const lo = Math.max(range.lo, grid.yFrom);
  const hi = Math.min(range.hi, grid.yFrom + grid.sy - 1);
  if (hi < lo) return [];
  const sections: [number, number, number][] = [];
  const centerX = grid.sx / 2;
  const centerZ = grid.sz / 2;
  for (let y = Math.floor(lo / SECTION); y <= Math.floor(hi / SECTION); y += 1) {
    const layer: [number, number, number][] = [];
    for (let z = 0; z < Math.ceil(grid.sz / SECTION); z += 1) {
      for (let x = 0; x < Math.ceil(grid.sx / SECTION); x += 1) layer.push([x, y, z]);
    }
    layer.sort(
      (a, b) =>
        Math.hypot(a[0] * SECTION - centerX, a[2] * SECTION - centerZ) -
        Math.hypot(b[0] * SECTION - centerX, b[2] * SECTION - centerZ),
    );
    sections.push(...layer);
  }
  return sections;
}

export function totalQuads(layerQuads: ArrayLike<number>): number {
  let total = 0;
  for (let index = 0; index < layerQuads.length; index += 1) total += layerQuads[index];
  return total;
}

export function fitRange(
  layerQuads: ArrayLike<number>,
  yFrom: number,
  budget: number,
  wanted: LayerRange,
  anchor: "lo" | "hi" = "lo",
): LayerRange {
  let lo = Math.max(wanted.lo, yFrom);
  let hi = Math.min(wanted.hi, yFrom + layerQuads.length - 1);
  let total = 0;
  if (anchor === "hi") {
    for (let y = hi; y >= lo; y -= 1) {
      total += layerQuads[y - yFrom] ?? 0;
      if (total > budget && y < hi) {
        lo = y + 1;
        break;
      }
    }
    return { lo, hi };
  }
  for (let y = lo; y <= hi; y += 1) {
    total += layerQuads[y - yFrom] ?? 0;
    if (total > budget && y > lo) {
      hi = y - 1;
      break;
    }
  }
  return { lo, hi };
}
