import { BlockProps } from "@/shared/blockState";
import type { RawQuad } from "./blockModels";

type Vec3 = [number, number, number];
type Mat = number[];

interface Box {
  u: number;
  v: number;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  grow?: number;
  mirror?: boolean;
}

interface Pose {
  x?: number;
  y?: number;
  z?: number;
  xRot?: number;
  yRot?: number;
  zRot?: number;
}

interface Part extends Pose {
  boxes: Box[];
  parent?: Pose;
  texture?: string;
  tinted?: boolean;
}

export interface EntityModel {
  texture: string;
  fallbacks?: string[];
  width: number;
  height: number;
  parts: Part[];
  transform: Mat;
}

const DIRECTION_VECTORS: Vec3[] = [
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
  [-1, 0, 0],
  [1, 0, 0],
];

const FACING_DEGREES: Record<string, number> = { south: 0, west: 90, north: 180, east: 270 };

function identity(): Mat {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function multiply(a: Mat, b: Mat): Mat {
  const out = new Array<number>(16).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[row * 4 + k] * b[k * 4 + column];
      out[row * 4 + column] = sum;
    }
  }
  return out;
}

function translate(x: number, y: number, z: number): Mat {
  return [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
}

function scale(x: number, y: number, z: number): Mat {
  return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
}

function rotate(axis: "x" | "y" | "z", radians: number): Mat {
  const quarter = Math.abs(radians / (Math.PI / 2) - Math.round(radians / (Math.PI / 2))) < 1e-9;
  const cos = quarter ? Math.round(Math.cos(radians)) : Math.cos(radians);
  const sin = quarter ? Math.round(Math.sin(radians)) : Math.sin(radians);
  if (axis === "x") return [1, 0, 0, 0, 0, cos, -sin, 0, 0, sin, cos, 0, 0, 0, 0, 1];
  if (axis === "y") return [cos, 0, sin, 0, 0, 1, 0, 0, -sin, 0, cos, 0, 0, 0, 0, 1];
  return [cos, -sin, 0, 0, sin, cos, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function chain(...matrices: Mat[]): Mat {
  return matrices.reduce((result, matrix) => multiply(result, matrix), identity());
}

function apply(matrix: Mat, [x, y, z]: Vec3): Vec3 {
  return [
    matrix[0] * x + matrix[1] * y + matrix[2] * z + matrix[3],
    matrix[4] * x + matrix[5] * y + matrix[6] * z + matrix[7],
    matrix[8] * x + matrix[9] * y + matrix[10] * z + matrix[11],
  ];
}

const degrees = (value: number) => (value * Math.PI) / 180;

function aroundCenter(...matrices: Mat[]): Mat {
  return chain(translate(0.5, 0.5, 0.5), ...matrices, translate(-0.5, -0.5, -0.5));
}

function directionOf([x, y, z]: Vec3): number {
  let best = 1;
  let bestDot = -Infinity;
  DIRECTION_VECTORS.forEach((vector, index) => {
    const dot = vector[0] * x + vector[1] * y + vector[2] * z;
    if (dot > bestDot) {
      bestDot = dot;
      best = index;
    }
  });
  return best;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function minus(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function boxPolygons(box: Box) {
  const { u, v, dx, dy, dz } = box;
  const grow = box.grow ?? 0;
  const y = box.y - grow;
  const z = box.z - grow;
  const y1 = box.y + dy + grow;
  const z1 = box.z + dz + grow;
  let x = box.x - grow;
  let x1 = box.x + dx + grow;
  if (box.mirror) [x, x1] = [x1, x];
  const v7: Vec3 = [x, y, z];
  const v0: Vec3 = [x1, y, z];
  const v1: Vec3 = [x1, y1, z];
  const v2: Vec3 = [x, y1, z];
  const v3: Vec3 = [x, y, z1];
  const v4: Vec3 = [x1, y, z1];
  const v5: Vec3 = [x1, y1, z1];
  const v6: Vec3 = [x, y1, z1];
  const f4 = u;
  const f5 = u + dz;
  const f6 = u + dz + dx;
  const f7 = u + dz + dx + dx;
  const f8 = u + dz + dx + dz;
  const f9 = u + dz + dx + dz + dx;
  const f10 = v;
  const f11 = v + dz;
  const f12 = v + dz + dy;
  const center: Vec3 = [(x + x1) / 2, (y + y1) / 2, (z + z1) / 2];
  const flip = box.mirror ? -1 : 1;
  return [
    { points: [v4, v3, v7, v0], uv: [f5, f10, f6, f11], area: dx * dz, direction: 0 },
    { points: [v1, v2, v6, v5], uv: [f6, f11, f7, f10], area: dx * dz, direction: 1 },
    { points: [v7, v3, v6, v2], uv: [f4, f11, f5, f12], area: dz * dy, direction: 4 },
    { points: [v0, v7, v2, v1], uv: [f5, f11, f6, f12], area: dx * dy, direction: 2 },
    { points: [v4, v0, v1, v5], uv: [f6, f11, f8, f12], area: dz * dy, direction: 5 },
    { points: [v3, v4, v5, v6], uv: [f8, f11, f9, f12], area: dx * dy, direction: 3 },
  ].map((polygon) => {
    const [vx, vy, vz] = DIRECTION_VECTORS[polygon.direction];
    return { ...polygon, center, vector: [vx * flip, vy, vz] as Vec3 };
  });
}

function poseMatrix(pose: Pose): Mat {
  return chain(
    translate((pose.x ?? 0) / 16, (pose.y ?? 0) / 16, (pose.z ?? 0) / 16),
    rotate("z", pose.zRot ?? 0),
    rotate("y", pose.yRot ?? 0),
    rotate("x", pose.xRot ?? 0),
  );
}

function partMatrix(part: Part): Mat {
  return chain(
    part.parent ? poseMatrix(part.parent) : identity(),
    poseMatrix(part),
    scale(1 / 16, 1 / 16, 1 / 16),
  );
}

export function entityTextures(model: EntityModel): string[] {
  return [
    ...new Set(model.parts.map((part) => part.texture).filter((texture): texture is string => !!texture)),
  ];
}

export function bakeEntityModel(model: EntityModel): RawQuad[] {
  const quads: RawQuad[] = [];
  for (const part of model.parts) {
    const matrix = multiply(model.transform, partMatrix(part));
    for (const box of part.boxes) {
      for (const polygon of boxPolygons(box)) {
        if (polygon.area === 0) continue;
        const [u1, v1, u2, v2] = polygon.uv;
        const uvs = [
          [u2, v1],
          [u1, v1],
          [u1, v2],
          [u2, v2],
        ].map(([pu, pv]) => [pu / model.width, pv / model.height]);
        let points = polygon.points.map((point) => apply(matrix, point));
        let corners = uvs;
        const vector = polygon.vector;
        const outward = minus(
          apply(matrix, [
            polygon.center[0] + vector[0],
            polygon.center[1] + vector[1],
            polygon.center[2] + vector[2],
          ]),
          apply(matrix, polygon.center),
        );
        const normal = cross(minus(points[1], points[0]), minus(points[2], points[0]));
        if (normal[0] * outward[0] + normal[1] * outward[1] + normal[2] * outward[2] < 0) {
          points = [points[0], points[3], points[2], points[1]];
          corners = [corners[0], corners[3], corners[2], corners[1]];
        }
        quads.push({
          positions: points.flat(),
          uvs: corners.flat(),
          texture: part.texture ?? model.texture,
          cull: -1,
          shade: directionOf(outward),
          tinted: part.tinted ?? false,
        });
      }
    }
  }
  return quads;
}

const box = (u: number, v: number, x: number, y: number, z: number, dx: number, dy: number, dz: number): Box => ({
  u,
  v,
  x,
  y,
  z,
  dx,
  dy,
  dz,
});

function chestTexture(path: string): string | null {
  if (path === "chest") return "normal";
  if (path === "trapped_chest") return "trapped";
  if (path === "ender_chest") return "ender";
  const copper = /^(?:waxed_)?(?:(exposed|weathered|oxidized)_)?copper_chest$/.exec(path);
  if (copper) return copper[1] ? `copper_${copper[1]}` : "copper";
  return null;
}

function chestModel(namespace: string, path: string, props: BlockProps): EntityModel | null {
  const base = chestTexture(path);
  if (!base) return null;
  const type = path === "ender_chest" ? "single" : props.type ?? "single";
  const facing = FACING_DEGREES[props.facing ?? "south"] ?? 0;
  const transform = aroundCenter(rotate("y", degrees(-facing)));
  const lid = { x: 0, y: 9, z: 1 };
  const parts: Part[] =
    type === "left"
      ? [
          { boxes: [box(0, 19, 0, 0, 1, 15, 10, 14)] },
          { ...lid, boxes: [box(0, 0, 0, 0, 0, 15, 5, 14)] },
          { ...lid, boxes: [box(0, 0, 0, -2, 14, 1, 4, 1)] },
        ]
      : type === "right"
        ? [
            { boxes: [box(0, 19, 1, 0, 1, 15, 10, 14)] },
            { ...lid, boxes: [box(0, 0, 1, 0, 0, 15, 5, 14)] },
            { ...lid, boxes: [box(0, 0, 15, -2, 14, 1, 4, 1)] },
          ]
        : [
            { boxes: [box(0, 19, 1, 0, 1, 14, 10, 14)] },
            { ...lid, boxes: [box(0, 0, 1, 0, 0, 14, 5, 14)] },
            { ...lid, boxes: [box(0, 0, 7, -2, 14, 2, 4, 1)] },
          ];
  const suffix = type === "left" ? "_left" : type === "right" ? "_right" : "";
  return {
    texture: `${namespace}:entity/chest/${base}${suffix}`,
    width: 64,
    height: 64,
    parts,
    transform,
  };
}

function bedModel(namespace: string, path: string, props: BlockProps): EntityModel | null {
  const color = /^(.+)_bed$/.exec(path)?.[1];
  if (!color) return null;
  const head = props.part === "head";
  const facing = FACING_DEGREES[props.facing ?? "north"] ?? 180;
  const transform = chain(
    translate(0, 0.5625, 0),
    rotate("x", Math.PI / 2),
    aroundCenter(rotate("z", degrees(180 + facing))),
  );
  const parts: Part[] = head
    ? [
        { boxes: [box(0, 0, 0, 0, 0, 16, 16, 6)] },
        { boxes: [box(50, 6, 0, 6, 0, 3, 3, 3)], xRot: Math.PI / 2, zRot: Math.PI / 2 },
        { boxes: [box(50, 18, -16, 6, 0, 3, 3, 3)], xRot: Math.PI / 2, zRot: Math.PI },
      ]
    : [
        { boxes: [box(0, 22, 0, 0, 0, 16, 16, 6)] },
        { boxes: [box(50, 0, 0, 6, -16, 3, 3, 3)], xRot: Math.PI / 2 },
        { boxes: [box(50, 12, -16, 6, -16, 3, 3, 3)], xRot: Math.PI / 2, zRot: Math.PI * 1.5 },
      ];
  return { texture: `${namespace}:entity/bed/${color}`, width: 64, height: 64, parts, transform };
}

function signModel(namespace: string, path: string, props: BlockProps): EntityModel | null {
  const hanging = /^(.+?)_(wall_)?hanging_sign$/.exec(path);
  if (hanging) {
    const wall = !!hanging[2];
    const angle = wall
      ? (FACING_DEGREES[props.facing ?? "south"] ?? 0)
      : Number(props.rotation ?? 0) * 22.5;
    const attached = !wall && props.attached === "true";
    const parts: Part[] = [{ boxes: [box(0, 12, -7, 0, -1, 14, 10, 2)] }];
    if (wall) parts.push({ boxes: [box(0, 0, -8, -6, -2, 16, 2, 4)] });
    if (attached) {
      parts.push({ boxes: [box(14, 6, -6, -6, 0, 12, 6, 0)] });
    } else {
      for (const [x, u, yRot] of [
        [-5, 0, -Math.PI / 4],
        [-5, 6, Math.PI / 4],
        [5, 0, -Math.PI / 4],
        [5, 6, Math.PI / 4],
      ]) {
        parts.push({ x, y: -6, z: 0, yRot, boxes: [box(u, 6, -1.5, 0, 0, 3, 6, 0)] });
      }
    }
    return {
      texture: `${namespace}:entity/signs/hanging/${hanging[1]}`,
      width: 64,
      height: 32,
      parts,
      transform: chain(
        translate(0.5, 0.9375, 0.5),
        rotate("y", degrees(-angle)),
        translate(0, -0.3125, 0),
        scale(1, -1, -1),
      ),
    };
  }

  const sign = /^(.+?)_(wall_)?sign$/.exec(path);
  if (!sign) return null;
  const wall = !!sign[2];
  const angle = wall
    ? (FACING_DEGREES[props.facing ?? "south"] ?? 0)
    : Number(props.rotation ?? 0) * 22.5;
  const parts: Part[] = [{ boxes: [box(0, 0, -12, -14, -1, 24, 12, 2)] }];
  if (!wall) parts.push({ boxes: [box(0, 14, -1, -2, -1, 2, 14, 2)] });
  return {
    texture: `${namespace}:entity/signs/${sign[1]}`,
    width: 64,
    height: 32,
    parts,
    transform: chain(
      translate(0.5, 0.5, 0.5),
      rotate("y", degrees(-angle)),
      wall ? translate(0, -0.3125, -0.4375) : identity(),
      scale(2 / 3, -2 / 3, -2 / 3),
    ),
  };
}

const DIRECTION_ROTATIONS: Record<string, Mat> = {
  down: rotate("x", Math.PI),
  up: identity(),
  north: chain(rotate("x", Math.PI / 2), rotate("z", Math.PI)),
  south: rotate("x", Math.PI / 2),
  west: chain(rotate("x", Math.PI / 2), rotate("z", Math.PI / 2)),
  east: chain(rotate("x", Math.PI / 2), rotate("z", -Math.PI / 2)),
};

function shulkerModel(namespace: string, path: string, props: BlockProps): EntityModel | null {
  const color = /^(?:(.+)_)?shulker_box$/.exec(path);
  if (!color) return null;
  return {
    texture: `${namespace}:entity/shulker/shulker${color[1] ? `_${color[1]}` : ""}`,
    width: 64,
    height: 64,
    parts: [
      { y: 24, boxes: [box(0, 0, -8, -16, -8, 16, 12, 16)] },
      { y: 24, boxes: [box(0, 28, -8, -8, -8, 16, 8, 16)] },
    ],
    transform: chain(
      translate(0.5, 0.5, 0.5),
      scale(0.9995, 0.9995, 0.9995),
      DIRECTION_ROTATIONS[props.facing ?? "up"] ?? identity(),
      scale(1, -1, -1),
      translate(0, -1, 0),
    ),
  };
}

export const DYE_TINTS: Record<string, number> = {
  white: 0xf9fffe,
  orange: 0xf9801d,
  magenta: 0xc74ebd,
  light_blue: 0x3ab3da,
  yellow: 0xfed83d,
  lime: 0x80c71f,
  pink: 0xf38baa,
  gray: 0x474f52,
  light_gray: 0x9d9d97,
  cyan: 0x169c9c,
  purple: 0x8932b8,
  blue: 0x3c44aa,
  brown: 0x835432,
  green: 0x5e7c16,
  red: 0xb02e26,
  black: 0x1d1d21,
};

function bannerModel(namespace: string, path: string, props: BlockProps): EntityModel | null {
  const banner = /^(.+?)_(wall_)?banner$/.exec(path);
  if (!banner || DYE_TINTS[banner[1]] === undefined) return null;
  const wall = !!banner[2];
  const parts: Part[] = [
    { boxes: [box(0, 42, -10, -32, -1, 20, 2, 2)] },
    {
      y: -32,
      texture: `${namespace}:entity/banner/base`,
      tinted: true,
      boxes: [box(0, 0, -10, 0, -2, 20, 40, 1)],
    },
  ];
  if (!wall) parts.push({ boxes: [box(44, 0, -1, -30, -1, 2, 42, 2)] });
  const transform = wall
    ? chain(
        translate(0.5, -1 / 6, 0.5),
        rotate("y", degrees(-(FACING_DEGREES[props.facing ?? "south"] ?? 0))),
        translate(0, -0.3125, -0.4375),
      )
    : chain(translate(0.5, 0.5, 0.5), rotate("y", degrees(-Number(props.rotation ?? 0) * 22.5)));
  return {
    texture: `${namespace}:entity/banner_base`,
    fallbacks: [`${namespace}:entity/banner/banner_base`],
    width: 64,
    height: 64,
    parts,
    transform: multiply(transform, scale(2 / 3, -2 / 3, -2 / 3)),
  };
}

const HEADS: Record<string, { textures: string[]; kind: "mob" | "humanoid" | "piglin" | "dragon" }> = {
  skeleton: { textures: ["entity/skeleton/skeleton"], kind: "mob" },
  wither_skeleton: { textures: ["entity/skeleton/wither_skeleton"], kind: "mob" },
  creeper: { textures: ["entity/creeper/creeper"], kind: "mob" },
  zombie: { textures: ["entity/zombie/zombie"], kind: "humanoid" },
  player: { textures: ["entity/player/wide/steve", "entity/steve"], kind: "humanoid" },
  piglin: { textures: ["entity/piglin/piglin"], kind: "piglin" },
  dragon: { textures: ["entity/enderdragon/dragon"], kind: "dragon" },
};

function headParts(kind: "mob" | "humanoid" | "piglin" | "dragon", yRot: number): Part[] {
  const head: Pose = { yRot };
  if (kind === "dragon") {
    return [
      {
        ...head,
        boxes: [
          box(176, 44, -6, -1, -24, 12, 5, 16),
          box(112, 30, -8, -8, -10, 16, 16, 16),
          { ...box(0, 0, -5, -12, -4, 2, 4, 6), mirror: true },
          { ...box(112, 0, -5, -3, -22, 2, 2, 4), mirror: true },
          box(0, 0, 3, -12, -4, 2, 4, 6),
          box(112, 0, 3, -3, -22, 2, 2, 4),
        ],
      },
      { parent: head, y: 4, z: -8, xRot: 0.2, boxes: [box(176, 65, -6, 0, -16, 12, 4, 16)] },
    ];
  }
  if (kind === "piglin") {
    return [
      {
        ...head,
        boxes: [
          box(0, 0, -5, -8, -4, 10, 8, 8),
          box(31, 1, -2, -4, -5, 4, 4, 1),
          box(2, 4, 2, -2, -5, 1, 2, 1),
          box(2, 0, -3, -2, -5, 1, 2, 1),
        ],
      },
      { parent: head, x: 4.5, y: -6, zRot: -Math.PI / 6, boxes: [box(51, 6, 0, 0, -2, 1, 5, 4)] },
      { parent: head, x: -4.5, y: -6, zRot: Math.PI / 6, boxes: [box(39, 6, -1, 0, -2, 1, 5, 4)] },
    ];
  }
  const parts: Part[] = [{ ...head, boxes: [box(0, 0, -4, -8, -4, 8, 8, 8)] }];
  if (kind === "humanoid") {
    parts.push({ ...head, boxes: [{ ...box(32, 0, -4, -8, -4, 8, 8, 8), grow: 0.25 }] });
  }
  return parts;
}

const SEGMENT_OF_FACING: Record<string, number> = { south: 0, west: 4, north: 8, east: 12 };
const OPPOSITE: Record<string, string> = { north: "south", south: "north", east: "west", west: "east" };
const STEP: Record<string, [number, number]> = {
  north: [0, -1],
  south: [0, 1],
  west: [-1, 0],
  east: [1, 0],
};

function headModel(namespace: string, path: string, props: BlockProps): EntityModel | null {
  const match = /^(.+?)_(wall_)?(skull|head)$/.exec(path);
  const head = match ? HEADS[match[1]] : undefined;
  if (!match || !head) return null;
  const wall = !!match[2];
  const facing = props.facing ?? "north";
  const segment = wall
    ? SEGMENT_OF_FACING[OPPOSITE[facing] ?? "south"] ?? 0
    : Number(props.rotation ?? 0);
  const [stepX, stepZ] = STEP[facing] ?? [0, 0];
  const place = wall ? translate(0.5 - stepX * 0.25, 0.25, 0.5 - stepZ * 0.25) : translate(0.5, 0, 0.5);
  const dragon = head.kind === "dragon"
    ? chain(translate(0, -0.374375, 0), scale(0.75, 0.75, 0.75))
    : identity();
  const [texture, ...fallbacks] = head.textures.map((name) => `${namespace}:${name}`);
  return {
    texture,
    fallbacks,
    width: head.kind === "dragon" ? 256 : 64,
    height: head.kind === "mob" ? 32 : head.kind === "dragon" ? 256 : 64,
    parts: headParts(head.kind, degrees(segment * 22.5)),
    transform: chain(place, scale(-1, -1, 1), dragon),
  };
}

export function entityModelFor(name: string, props: BlockProps): EntityModel | null {
  const at = name.indexOf(":");
  const namespace = name.slice(0, at);
  const path = name.slice(at + 1);
  if (namespace !== "minecraft") return null;
  if (path.endsWith("chest")) return chestModel(namespace, path, props);
  if (path.endsWith("_bed")) return bedModel(namespace, path, props);
  if (path.endsWith("sign")) return signModel(namespace, path, props);
  if (path.endsWith("shulker_box")) return shulkerModel(namespace, path, props);
  if (path.endsWith("banner")) return bannerModel(namespace, path, props);
  if (path.endsWith("skull") || path.endsWith("head")) return headModel(namespace, path, props);
  return null;
}
