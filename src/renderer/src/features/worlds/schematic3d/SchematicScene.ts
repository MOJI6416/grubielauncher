import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import MeshWorker from "./meshWorker?worker";
import type { MeshRequest, MeshResponse } from "./meshWorker";
import {
  CompiledModels,
  LayerRange,
  MeshPart,
  SECTION,
  SectionMesh,
  VolumeGrid,
  sectionKey,
  sectionsInRange,
} from "./mesher";

export type CameraView = "top" | "front" | "side" | "reset";

export interface SceneColors {
  grid: string;
  highlight: string;
}

export interface PickResult {
  x: number;
  y: number;
  z: number;
  state: number;
}

export interface BuildProgress {
  built: number;
  total: number;
  quads: number;
  elapsed: number | null;
}

interface SectionEntry {
  meshes: THREE.Mesh[];
  signature: string;
  quads: number;
}

const FOV = 35;
const CLIP_MARGIN = 0.01;
const GRID_DROP = 0.02;
const ISO_DIRECTION = new THREE.Vector3(1, 0.85, 1.15).normalize();

function cssColor(value: string): THREE.Color {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.Color(0x888888);
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return new THREE.Color(r / 255, g / 255, b / 255);
}

function freeOnUpload(attribute: THREE.BufferAttribute) {
  attribute.onUpload(function (this: THREE.BufferAttribute) {
    (this as unknown as { array: null }).array = null;
  });
  return attribute;
}

export class SchematicScene {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 4000);
  private readonly controls: OrbitControls | null;
  private readonly root = new THREE.Group();
  private readonly helpers = new THREE.Group();
  private readonly sections = new Map<string, SectionEntry>();
  private readonly clipLow = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly clipHigh = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  private readonly opaqueMaterial: THREE.MeshBasicMaterial;
  private readonly translucentMaterial: THREE.MeshBasicMaterial;
  private readonly highlight: THREE.LineSegments;
  private readonly gridMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.55 });
  private texture: THREE.CanvasTexture | null = null;
  private worker: Worker | null = null;
  private grid: VolumeGrid | null = null;
  private models: CompiledModels | null = null;
  private range: LayerRange = { lo: 0, hi: 0 };
  private generation = 0;
  private pending = new Set<string>();
  private total = 0;
  private buildStarted = 0;
  private dirty = true;
  private frame = 0;
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;
  private countedResolve: ((value: Uint32Array) => void) | null = null;
  private doneResolve: (() => void) | null = null;
  layerQuads: Uint32Array = new Uint32Array(0);
  onProgress: ((progress: BuildProgress) => void) | null = null;
  onChange: (() => void) | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    options: { interactive: boolean },
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: options.interactive,
      alpha: true,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.localClippingEnabled = true;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    const clipping = [this.clipLow, this.clipHigh];
    this.opaqueMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      alphaTest: 0.5,
      clippingPlanes: clipping,
    });
    this.translucentMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      alphaTest: 0.02,
      clippingPlanes: clipping,
    });

    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.04, 1.04, 1.04)),
      new THREE.LineBasicMaterial({ depthTest: false, transparent: true }),
    );
    this.highlight.renderOrder = 10;
    this.highlight.visible = false;

    this.scene.add(this.root, this.helpers, this.highlight);

    if (options.interactive) {
      this.controls = new OrbitControls(this.camera, canvas);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.18;
      this.controls.screenSpacePanning = true;
      this.controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
      this.controls.addEventListener("change", () => {
        this.dirty = true;
        this.onChange?.();
      });
      this.loop();
    } else {
      this.controls = null;
    }
  }

  observe(container: HTMLElement) {
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => this.resize(container));
    this.resizeObserver.observe(container);
    this.resize(container);
  }

  private resize(container: HTMLElement) {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private loop = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    if (document.hidden) return;
    this.controls?.update();
    if (this.dirty) {
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
    }
  };

  requestRender() {
    this.dirty = true;
  }

  renderNow() {
    this.renderer.render(this.scene, this.camera);
  }

  setColors(colors: SceneColors) {
    this.gridMaterial.color = cssColor(colors.grid);
    (this.highlight.material as THREE.LineBasicMaterial).color = cssColor(colors.highlight);
    this.dirty = true;
  }

  setAtlas(canvas: HTMLCanvasElement) {
    this.texture?.dispose();
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.flipY = false;
    texture.colorSpace = THREE.NoColorSpace;
    this.texture = texture;
    this.opaqueMaterial.map = texture;
    this.translucentMaterial.map = texture;
    this.opaqueMaterial.needsUpdate = true;
    this.translucentMaterial.needsUpdate = true;
  }

  load(grid: VolumeGrid, models: CompiledModels): Promise<Uint32Array> {
    this.clearSections();
    this.grid = grid;
    this.models = models;
    this.worker ??= this.createWorker();
    const message: MeshRequest = {
      type: "init",
      grid: { ...grid, data: grid.data.slice() },
      models,
    };
    return new Promise((resolve) => {
      this.countedResolve = resolve;
      this.worker!.postMessage(message, [message.grid.data.buffer]);
    });
  }

  private createWorker(): Worker {
    const worker = new MeshWorker();
    worker.onmessage = (event: MessageEvent<MeshResponse>) => this.receive(event.data);
    return worker;
  }

  private receive(message: MeshResponse) {
    if (this.disposed) return;
    if (message.type === "counted") {
      this.layerQuads = message.layerQuads;
      this.countedResolve?.(message.layerQuads);
      this.countedResolve = null;
      return;
    }
    if (message.generation !== this.generation) return;
    if (message.type === "section") {
      this.addSection(message.mesh);
      this.pending.delete(message.mesh.key);
      this.reportProgress(null);
      return;
    }
    this.reportProgress(message.elapsed);
    this.doneResolve?.();
    this.doneResolve = null;
  }

  private reportProgress(elapsed: number | null) {
    let quads = 0;
    for (const entry of this.sections.values()) quads += entry.quads;
    this.onProgress?.({
      built: this.total - this.pending.size,
      total: this.total,
      quads,
      elapsed: elapsed === null ? null : performance.now() - this.buildStarted,
    });
  }

  private geometry(part: MeshPart, mesh: SectionMesh): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", freeOnUpload(new THREE.BufferAttribute(part.positions, 3)));
    geometry.setAttribute("uv", freeOnUpload(new THREE.BufferAttribute(part.uvs, 2)));
    geometry.setAttribute("color", freeOnUpload(new THREE.BufferAttribute(part.colors, 3, true)));
    geometry.setIndex(freeOnUpload(new THREE.BufferAttribute(part.indices, 1)));
    const half = SECTION / 2;
    geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(mesh.x * SECTION + half, mesh.y * SECTION + half, mesh.z * SECTION + half),
      SECTION,
    );
    return geometry;
  }

  private signature(sectionY: number): string {
    const y0 = sectionY * SECTION;
    return `${Math.max(this.range.lo, y0 - 1)}:${Math.min(this.range.hi, y0 + SECTION)}`;
  }

  private addSection(mesh: SectionMesh) {
    this.removeSection(mesh.key);
    const meshes: THREE.Mesh[] = [];
    if (mesh.opaque) {
      meshes.push(new THREE.Mesh(this.geometry(mesh.opaque, mesh), this.opaqueMaterial));
    }
    if (mesh.translucent) {
      const translucent = new THREE.Mesh(this.geometry(mesh.translucent, mesh), this.translucentMaterial);
      translucent.renderOrder = 1;
      meshes.push(translucent);
    }
    for (const item of meshes) {
      item.matrixAutoUpdate = false;
      this.root.add(item);
    }
    this.sections.set(mesh.key, { meshes, signature: this.signature(mesh.y), quads: mesh.quads });
    this.dirty = true;
  }

  private removeSection(key: string) {
    const entry = this.sections.get(key);
    if (!entry) return;
    for (const mesh of entry.meshes) {
      this.root.remove(mesh);
      mesh.geometry.dispose();
    }
    this.sections.delete(key);
  }

  private clearSections() {
    for (const key of [...this.sections.keys()]) this.removeSection(key);
  }

  get builtQuads(): number {
    let quads = 0;
    for (const entry of this.sections.values()) quads += entry.quads;
    return quads;
  }

  setRange(range: LayerRange, options: { immediate?: boolean } = {}): Promise<void> {
    this.range = range;
    this.clipLow.constant = CLIP_MARGIN - range.lo;
    this.clipHigh.constant = range.hi + 1 + CLIP_MARGIN;
    this.updateHelpers();
    this.dirty = true;
    if (this.rebuildTimer) clearTimeout(this.rebuildTimer);
    return new Promise((resolve) => {
      const run = () => {
        this.rebuildTimer = null;
        this.rebuild();
        if (this.pending.size === 0) resolve();
        else this.doneResolve = resolve;
      };
      if (options.immediate) run();
      else this.rebuildTimer = setTimeout(run, 180);
    });
  }

  private rebuild() {
    if (!this.grid || !this.worker) return;
    const wanted = sectionsInRange(this.grid, this.range);
    const keep = new Set(wanted.map(([x, y, z]) => sectionKey(x, y, z)));
    for (const key of [...this.sections.keys()]) {
      if (!keep.has(key)) this.removeSection(key);
    }
    const stale = wanted.filter(([x, y, z]) => {
      const entry = this.sections.get(sectionKey(x, y, z));
      return !entry || entry.signature !== this.signature(y);
    });
    this.generation += 1;
    this.pending = new Set(stale.map(([x, y, z]) => sectionKey(x, y, z)));
    this.total = wanted.length;
    this.buildStarted = performance.now();
    this.worker.postMessage({
      type: "build",
      generation: this.generation,
      range: this.range,
      sections: stale,
    } satisfies MeshRequest);
    this.reportProgress(stale.length ? null : 0);
  }

  private updateHelpers() {
    for (const child of [...this.helpers.children]) {
      this.helpers.remove(child);
      (child as THREE.LineSegments).geometry.dispose();
    }
    if (!this.grid) return;
    const { sx, sz } = this.grid;
    const y = this.range.lo - GRID_DROP;
    const step = Math.max(sx, sz) <= 96 ? 1 : SECTION;
    const points: number[] = [];
    for (let x = 0; x <= sx; x += step) points.push(x, y, 0, x, y, sz);
    if (sx % step) points.push(sx, y, 0, sx, y, sz);
    for (let z = 0; z <= sz; z += step) points.push(0, y, z, sx, y, z);
    if (sz % step) points.push(0, y, sz, sx, y, sz);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    this.helpers.add(new THREE.LineSegments(geometry, this.gridMaterial));
  }

  private bounds() {
    const grid = this.grid;
    const sx = grid?.sx ?? 1;
    const sz = grid?.sz ?? 1;
    const lo = this.range.lo;
    const hi = this.range.hi + 1;
    const center = new THREE.Vector3(sx / 2, (lo + hi) / 2, sz / 2);
    const radius = Math.max(1, 0.5 * Math.hypot(sx, hi - lo, sz));
    return { center, radius };
  }

  private distanceFor(radius: number, aspect: number) {
    const vertical = THREE.MathUtils.degToRad(FOV) / 2;
    const horizontal = Math.atan(Math.tan(vertical) * aspect);
    return (radius / Math.sin(Math.min(vertical, horizontal))) * 1.04;
  }

  setView(view: CameraView, camera = this.camera) {
    const { center, radius } = this.bounds();
    const distance = this.distanceFor(radius, camera.aspect);
    const direction =
      view === "top"
        ? new THREE.Vector3(0, 1, 0.0001)
        : view === "front"
          ? new THREE.Vector3(0, 0, 1)
          : view === "side"
            ? new THREE.Vector3(1, 0, 0)
            : ISO_DIRECTION.clone();
    camera.position.copy(center).addScaledVector(direction.normalize(), distance);
    camera.near = Math.max(0.05, distance / 500);
    camera.far = distance * 4 + radius * 4;
    camera.updateProjectionMatrix();
    camera.lookAt(center);
    if (camera === this.camera && this.controls) {
      this.controls.target.copy(center);
      this.controls.minDistance = 1;
      this.controls.maxDistance = distance * 6;
      this.controls.update();
    }
    this.dirty = true;
  }

  pick(clientX: number, clientY: number): PickResult | null {
    const grid = this.grid;
    const models = this.models;
    if (!grid || !models) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    const { origin, direction } = raycaster.ray;

    const lo = Math.max(this.range.lo, grid.yFrom);
    const hi = Math.min(this.range.hi, grid.yFrom + grid.sy - 1);
    const min = [0, lo, 0];
    const max = [grid.sx, hi + 1, grid.sz];
    const o = [origin.x, origin.y, origin.z];
    const d = [direction.x, direction.y, direction.z];
    let enter = 0;
    let exit = Infinity;
    for (let axis = 0; axis < 3; axis += 1) {
      if (Math.abs(d[axis]) < 1e-12) {
        if (o[axis] < min[axis] || o[axis] > max[axis]) return null;
        continue;
      }
      const t1 = (min[axis] - o[axis]) / d[axis];
      const t2 = (max[axis] - o[axis]) / d[axis];
      enter = Math.max(enter, Math.min(t1, t2));
      exit = Math.min(exit, Math.max(t1, t2));
    }
    if (exit < enter) return null;

    const start = enter + 1e-4;
    const cell = o.map((value, axis) => Math.floor(value + d[axis] * start));
    const step = d.map((value) => (value > 0 ? 1 : value < 0 ? -1 : 0));
    const next = d.map((value, axis) =>
      value === 0
        ? Infinity
        : ((cell[axis] + (value > 0 ? 1 : 0)) - (o[axis] + value * start)) / value + start,
    );
    const delta = d.map((value) => (value === 0 ? Infinity : Math.abs(1 / value)));
    const limit = grid.sx + grid.sy + grid.sz + 4;

    for (let guard = 0; guard < limit * 2; guard += 1) {
      const [x, y, z] = cell;
      if (x >= 0 && z >= 0 && x < grid.sx && z < grid.sz && y >= lo && y <= hi) {
        const state = grid.data[x + z * grid.sx + (y - grid.yFrom) * grid.sx * grid.sz];
        if (state !== 0 && models.visible[state]) return { x, y, z, state };
      }
      const axis = next[0] < next[1] ? (next[0] < next[2] ? 0 : 2) : next[1] < next[2] ? 1 : 2;
      if (next[axis] > exit + 1) break;
      cell[axis] += step[axis];
      next[axis] += delta[axis];
    }
    return null;
  }

  showHighlight(hit: PickResult | null) {
    this.highlight.visible = !!hit;
    if (hit) this.highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    this.dirty = true;
  }

  async snapshot(size: number): Promise<Uint8Array | null> {
    const target = new THREE.WebGLRenderTarget(size, size);
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 4000);
    this.setView("reset", camera);
    const helpers = this.helpers.visible;
    const highlight = this.highlight.visible;
    this.helpers.visible = false;
    this.highlight.visible = false;
    try {
      this.renderer.setRenderTarget(target);
      this.renderer.clear();
      this.renderer.render(this.scene, camera);
      const pixels = new Uint8Array(size * size * 4);
      this.renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) return null;
      const image = context.createImageData(size, size);
      for (let row = 0; row < size; row += 1) {
        image.data.set(
          pixels.subarray((size - 1 - row) * size * 4, (size - row) * size * 4),
          row * size * 4,
        );
      }
      context.putImageData(image, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    } finally {
      this.renderer.setRenderTarget(null);
      this.helpers.visible = helpers;
      this.highlight.visible = highlight;
      target.dispose();
      this.dirty = true;
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    if (this.rebuildTimer) clearTimeout(this.rebuildTimer);
    this.resizeObserver?.disconnect();
    this.worker?.terminate();
    this.worker = null;
    this.grid = null;
    this.models = null;
    this.clearSections();
    this.updateHelpers();
    this.controls?.dispose();
    this.texture?.dispose();
    this.opaqueMaterial.dispose();
    this.translucentMaterial.dispose();
    this.gridMaterial.dispose();
    this.highlight.geometry.dispose();
    (this.highlight.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
