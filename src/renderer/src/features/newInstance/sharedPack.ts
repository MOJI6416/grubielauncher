import type { IModpack as IBackendModpack } from "@/types/Backend";
import { suggestInstanceName } from "./nameValidation";
import {
  EMPTY_ARGUMENTS,
  type AppliedPack,
  type PackAuthor,
  type PackContent,
} from "./state";

export interface SharedPackOptions {
  authSub?: string;
  ownedByUser?: boolean;
  takenNames: string[];
}

export function isSharedPackOwned(
  shared: IBackendModpack,
  authSub?: string,
): boolean {
  const ownerId = shared.owner?._id;
  return !!authSub && !!ownerId && authSub === ownerId;
}

function sharedPackOwnership(shared: IBackendModpack): {
  owner?: string;
  ownerId?: string;
} {
  const owner = shared.owner;
  if (!owner?._id) return {};

  return {
    ...(owner.platform && owner.nickname
      ? { owner: `${owner.platform}_${owner.nickname}` }
      : {}),
    ownerId: owner._id,
  };
}

export function sharedPackAuthor(
  shared: IBackendModpack,
): PackAuthor | undefined {
  const owner = shared.owner;
  if (!owner?._id || !owner.nickname) return undefined;

  return {
    id: owner._id,
    nickname: owner.nickname,
    platform: owner.platform ?? null,
    headUrl: owner.headUrl ?? owner.image ?? null,
  };
}

export function buildSharedPack(
  shared: IBackendModpack,
  options: SharedPackOptions,
): { pack: AppliedPack; content: PackContent } {
  const conf = shared.conf;

  return {
    pack: {
      kind: "share",
      title: conf.name,
      description: conf.description || "",
      isOwner: options.ownedByUser ?? isSharedPackOwned(shared, options.authSub),
      author: sharedPackAuthor(shared),
      downloads: Number.isFinite(shared.downloads)
        ? Number(shared.downloads)
        : undefined,
      shareCode: shared._id,
      shareVersion: {
        ...conf,
        build: shared.build,
        downloadedVersion: true,
        lastLaunch: undefined,
        lastUpdate: new Date(),
        ...sharedPackOwnership(shared),
        shareCode: shared._id,
      },
    },
    content: {
      name: suggestInstanceName(conf.name, options.takenNames),
      image: conf.image,
      loader: conf.loader.name,
      minecraftVersion: conf.version,
      loaderVersion: conf.loader.version,
      mods: conf.loader.mods,
      servers: conf.servers,
      options: conf.options,
      runArguments: conf.runArguments || EMPTY_ARGUMENTS,
      quickServer: conf.quickServer || "",
    },
  };
}
