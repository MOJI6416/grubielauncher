import {
  ChunkEditResult,
  IChunkEditOptions,
  MAX_CHUNK_EDIT_COUNT,
  isDimensionId,
} from "@/types/WorldChunks";
import { normalizeWorldBackupKeep } from "@/types/WorldBackup";
import {
  deleteChunks,
  inspectChunk,
  listChunkDimensions,
  listChunkRegions,
  resetChunkInhabitedTime,
  scanChunkRegion,
} from "../utilities/worldChunks";
import {
  createWorldBackup,
  getVersionPathFromWorldPath,
  isVersionRunning,
} from "../utilities/worldBackups";
import { renderRegionSurface } from "../utilities/surfaceRender";
import { ArgCheck, check, handleSafe } from "../utilities/ipc";
import { assertReadablePath, assertWritablePath } from "../utilities/safePath";

const EDIT_FALLBACK: ChunkEditResult = { ok: false, error: "failed" };

/** Chunk coordinates stay far inside this in every Minecraft version. */
const MAX_CHUNK_COORDINATE = 1 << 26;

const isPath = check.nonEmptyString(4096);
const isDimension: ArgCheck = (value) => isDimensionId(value);
const isCoordinate: ArgCheck = (value) =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  Math.abs(value) <= MAX_CHUNK_COORDINATE;
const isCoordinateList: ArgCheck = (value) =>
  Array.isArray(value) &&
  value.length % 2 === 0 &&
  value.length <= MAX_CHUNK_EDIT_COUNT * 2 &&
  value.every(isCoordinate);
const isOptions: ArgCheck = (value) =>
  check.object(8)(value) &&
  typeof (value as IChunkEditOptions).backup === "boolean";

function editContext(worldPath: string, options: IChunkEditOptions) {
  if (!options.backup) return {};

  const keep = normalizeWorldBackupKeep(options.keep);
  return { backup: () => createWorldBackup(worldPath, "preEdit", keep) };
}

export function registerWorldChunksIpc() {
  handleSafe(
    "worldChunks:dimensions",
    [],
    [isPath],
    async (_, worldPath: string) => {
      assertReadablePath(worldPath, "worldChunks:dimensions");
      return await listChunkDimensions(worldPath);
    },
  );

  handleSafe(
    "worldChunks:renderSurface",
    null,
    [isPath, isDimension, isCoordinate, isCoordinate],
    async (
      _,
      worldPath: string,
      dimension: string,
      regionX: number,
      regionZ: number,
    ) => {
      assertReadablePath(worldPath, "worldChunks:renderSurface");
      return await renderRegionSurface(worldPath, dimension, regionX, regionZ);
    },
  );

  handleSafe(
    "worldChunks:regions",
    [],
    [isPath, isDimension],
    async (_, worldPath: string, dimension: string) => {
      assertReadablePath(worldPath, "worldChunks:regions");
      return await listChunkRegions(worldPath, dimension);
    },
  );

  handleSafe(
    "worldChunks:scanRegion",
    null,
    [isPath, isDimension, isCoordinate, isCoordinate],
    async (
      _,
      worldPath: string,
      dimension: string,
      regionX: number,
      regionZ: number,
    ) => {
      assertReadablePath(worldPath, "worldChunks:scanRegion");
      return await scanChunkRegion(worldPath, dimension, regionX, regionZ);
    },
  );

  handleSafe(
    "worldChunks:inspect",
    null,
    [isPath, isDimension, isCoordinate, isCoordinate],
    async (
      _,
      worldPath: string,
      dimension: string,
      chunkX: number,
      chunkZ: number,
    ) => {
      assertReadablePath(worldPath, "worldChunks:inspect");
      return await inspectChunk(worldPath, dimension, chunkX, chunkZ);
    },
  );

  handleSafe(
    "worldChunks:delete",
    EDIT_FALLBACK,
    [isPath, isDimension, isCoordinateList, isOptions],
    async (
      _,
      worldPath: string,
      dimension: string,
      coords: number[],
      options: IChunkEditOptions,
    ) => {
      assertWritablePath(worldPath, "worldChunks:delete");

      if (isVersionRunning(getVersionPathFromWorldPath(worldPath))) {
        return { ok: false, error: "versionRunning" } as ChunkEditResult;
      }

      return await deleteChunks(
        worldPath,
        dimension,
        coords,
        editContext(worldPath, options),
      );
    },
  );

  handleSafe(
    "worldChunks:resetInhabited",
    EDIT_FALLBACK,
    [isPath, isDimension, isCoordinateList, isOptions],
    async (
      _,
      worldPath: string,
      dimension: string,
      coords: number[],
      options: IChunkEditOptions,
    ) => {
      assertWritablePath(worldPath, "worldChunks:resetInhabited");

      if (isVersionRunning(getVersionPathFromWorldPath(worldPath))) {
        return { ok: false, error: "versionRunning" } as ChunkEditResult;
      }

      return await resetChunkInhabitedTime(
        worldPath,
        dimension,
        coords,
        editContext(worldPath, options),
      );
    },
  );
}
