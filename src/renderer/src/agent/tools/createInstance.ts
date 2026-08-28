import { getDefaultStore } from "jotai";
import { Loader } from "@/types/Loader";
import { IVersionConf } from "@/types/IVersion";
import {
  InstanceNameIssue,
  checkInstanceName,
} from "@renderer/features/newInstance/nameValidation";
import {
  accountAtom,
  pathsAtom,
  selectedVersionAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { Version } from "@renderer/classes/Version";
import { AgentTool } from "../types";
import { busyError, refreshVersions, SAVE_FAILED, settings } from "./shared";

const api = window.api;

const LOADERS: Loader[] = ["vanilla", "forge", "neoforge", "fabric", "quilt"];

const NAME_ERRORS: Record<InstanceNameIssue, string> = {
  empty: "The instance needs a name.",
  forbidden: "The name contains characters a folder name cannot hold.",
  emoji:
    "The name contains emoji: Java cannot open a game folder whose path has them.",
  control: "The name contains invisible characters.",
  dots: "A name made of dots only cannot be a folder.",
  trailing: "The name cannot end with a dot or a space.",
  reserved: "Windows reserves this name for a device.",
  tooLong: "The name is longer than 32 characters.",
  taken: "An instance with this name already exists.",
  folderTaken: "A folder with this name already exists in versions.",
};

export const createInstance: AgentTool = {
  name: "create_instance",
  risk: "write",
  description:
    "Create a new Minecraft instance and install it: the game files, the mod loader and Java. The instance starts empty — add mods afterwards with add_mods. Check list_minecraft_versions and list_loader_versions first so the version and loader actually exist. Installing takes a while and the user sees the progress.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Instance name, up to 32 characters, must be unused",
      },
      minecraftVersion: {
        type: "string",
        description: "Exact version id, for example 1.20.1",
      },
      loader: { type: "string", enum: LOADERS },
      loaderVersion: {
        type: "string",
        description:
          "Loader build id. Omit to take the newest one for this Minecraft version.",
      },
    },
    required: ["name", "minecraftVersion", "loader"],
  },
  summarize: (input) => ({
    key: "agent.tools.createInstance",
    params: { name: input?.name, version: input?.minecraftVersion },
  }),
  run: async (input) => {
    const store = getDefaultStore();
    const account = store.get(accountAtom);
    if (!account) return { ok: false, error: "No account is selected" };

    const busy = busyError();
    if (busy) return { ok: false, error: busy };

    const name = String(input?.name ?? "").trim();
    const existing = store.get(versionsAtom);

    const check = checkInstanceName(
      name,
      existing.map((version) => version.version.name),
    );

    if (!check.ok) {
      return {
        ok: false,
        error: `${NAME_ERRORS[check.issue ?? "empty"]}${
          check.suggestion ? ` Free name: "${check.suggestion}".` : ""
        }`,
      };
    }

    const loader: Loader = LOADERS.includes(input?.loader)
      ? input.loader
      : "vanilla";
    const minecraftVersion = String(input?.minecraftVersion ?? "").trim();

    const catalog = await api.versions.getList(loader, true);
    if (!catalog) return { ok: false, error: "Could not read the version catalogue — the launcher backend or Mojang metadata is unreachable. This is not a statement that the version does not exist." };

    const version = catalog.find((entry) => entry.id === minecraftVersion);
    if (!version) {
      return {
        ok: false,
        error: `${loader} has no Minecraft ${minecraftVersion}. Call list_minecraft_versions to see what exists.`,
      };
    }

    let loaderVersion: { id: string; url: string } | undefined;
    if (loader !== "vanilla") {
      const builds = await api.versions.getLoaderVersions(
        loader,
        minecraftVersion,
      );

      if (!builds) return { ok: false, error: "Could not read the version catalogue — the launcher backend or Mojang metadata is unreachable. This is not a statement that the version does not exist." };

      const wanted = String(input?.loaderVersion ?? "").trim();
      const picked = wanted
        ? builds.find((build) => build.id === wanted)
        : builds[0];

      if (!picked) {
        return {
          ok: false,
          error: wanted
            ? `${loader} ${wanted} does not exist for Minecraft ${minecraftVersion}`
            : `No ${loader} build is available for Minecraft ${minecraftVersion}`,
        };
      }

      loaderVersion = { id: picked.id, url: picked.url };
    }

    const paths = store.get(pathsAtom);
    const versionPath = await api.path.join(paths.minecraft, "versions", name);

    if (await api.fs.pathExists(versionPath)) {
      return { ok: false, error: NAME_ERRORS.folderTaken };
    }

    await api.fs.ensure(versionPath);

    const conf: IVersionConf = {
      name,
      version,
      downloadedVersion: false,
      lastUpdate: new Date(),
      build: 0,
      runArguments: { jvm: "", game: "" },
      image: "",
      loader: { name: loader, mods: [], version: loaderVersion },
      owner: `${account.type}_${account.nickname}`,
    };

    const instance = new Version(conf);

    try {
      await instance.init();
      await instance.install(account, settings(), [], {
        cleanupOnCancel: true,
      });
      if (!(await instance.save())) throw new Error(SAVE_FAILED);
    } catch (error) {
      await api.fs.rimraf(versionPath).catch(() => undefined);
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    store.set(versionsAtom, [...store.get(versionsAtom), instance]);
    store.set(selectedVersionAtom, instance);
    refreshVersions();

    return {
      ok: true,
      data: {
        name,
        minecraftVersion: version.id,
        loader:
          loader === "vanilla" ? "vanilla" : `${loader} ${loaderVersion?.id}`,
        note: "The instance is empty. Use add_mods to install anything into it.",
      },
    };
  },
};
