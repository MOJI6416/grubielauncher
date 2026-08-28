import { Loader } from "@/types/Loader";
import { AgentTool } from "../types";
import { limitList } from "../untrusted";

const api = window.api;

const MAX_VERSIONS = 25;
const LOADERS: Loader[] = ["vanilla", "forge", "neoforge", "fabric", "quilt"];

export const listMinecraftVersions: AgentTool = {
  name: "list_minecraft_versions",
  risk: "read",
  description:
    "List the Minecraft versions a given loader supports, newest first. Use it to confirm a version exists before creating an instance.",
  parameters: {
    type: "object",
    properties: {
      loader: { type: "string", enum: LOADERS },
      includeSnapshots: { type: "boolean" },
      limit: { type: "number", description: "1-25, defaults to 25" },
    },
    required: ["loader"],
  },
  summarize: (input) => ({
    key: "agent.tools.listMinecraftVersions",
    params: { loader: input?.loader },
  }),
  run: async (input) => {
    const loader = LOADERS.includes(input?.loader) ? input.loader : "vanilla";
    const versions = await api.versions.getList(
      loader,
      input?.includeSnapshots === true,
    );

    if (!versions) return { ok: false, error: "Could not read the version catalogue — the launcher backend or Mojang metadata is unreachable. This is not a statement that the version does not exist." };

    const limited = limitList(
      versions,
      Math.min(MAX_VERSIONS, Math.max(1, Number(input?.limit) || MAX_VERSIONS)),
    );

    return {
      ok: true,
      data: {
        loader,
        total: limited.total,
        truncated: limited.truncated,
        versions: limited.items.map((version) => ({
          id: version.id,
          type: version.type,
        })),
      },
    };
  },
};

export const listLoaderVersions: AgentTool = {
  name: "list_loader_versions",
  risk: "read",
  description:
    "List the available loader builds for a Minecraft version, newest first. The first entry is normally the one to use.",
  parameters: {
    type: "object",
    properties: {
      loader: {
        type: "string",
        enum: ["forge", "neoforge", "fabric", "quilt"],
      },
      minecraftVersion: { type: "string" },
    },
    required: ["loader", "minecraftVersion"],
  },
  summarize: (input) => ({
    key: "agent.tools.listLoaderVersions",
    params: { loader: input?.loader, version: input?.minecraftVersion },
  }),
  run: async (input) => {
    const versions = await api.versions.getLoaderVersions(
      input?.loader,
      String(input?.minecraftVersion ?? ""),
    );

    if (!versions) return { ok: false, error: "Could not read the version catalogue — the launcher backend or Mojang metadata is unreachable. This is not a statement that the version does not exist." };

    const limited = limitList(versions, MAX_VERSIONS);

    return {
      ok: true,
      data: {
        total: limited.total,
        truncated: limited.truncated,
        versions: limited.items.map((version) => version.id),
      },
    };
  },
};
