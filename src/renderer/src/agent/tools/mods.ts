import { IVersionDependency, ProjectType, Provider } from "@/types/ModManager";
import { Loader } from "@/types/Loader";
import { AgentTool } from "../types";
import { limitList, truncate, wrapUntrusted } from "../untrusted";

const api = window.api;

const MAX_SEARCH_RESULTS = 8;
const MAX_VERSIONS = 12;
const MAX_BODY_CHARS = 4000;

const PROVIDERS = [Provider.MODRINTH, Provider.CURSEFORGE];
const PROJECT_TYPES = [
  ProjectType.MOD,
  ProjectType.RESOURCEPACK,
  ProjectType.SHADER,
  ProjectType.DATAPACK,
  ProjectType.MODPACK,
  ProjectType.WORLD,
];

function normalizeProvider(value: unknown): Provider {
  return value === Provider.CURSEFORGE
    ? Provider.CURSEFORGE
    : Provider.MODRINTH;
}

function normalizeProjectType(value: unknown): ProjectType {
  return PROJECT_TYPES.includes(value as ProjectType)
    ? (value as ProjectType)
    : ProjectType.MOD;
}

export const searchMods: AgentTool = {
  name: "search_mods",
  risk: "read",
  description:
    "Search Modrinth or CurseForge for mods, resource packs, shaders, datapacks, worlds or modpacks. Always pass minecraftVersion and loader when searching for something to install into an instance, otherwise the results will not be compatible.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search text" },
      provider: {
        type: "string",
        enum: PROVIDERS,
        description: "Defaults to modrinth",
      },
      projectType: { type: "string", enum: PROJECT_TYPES },
      minecraftVersion: { type: "string" },
      loader: {
        type: "string",
        enum: ["forge", "neoforge", "fabric", "quilt"],
      },
      limit: { type: "number", description: "1-8, defaults to 8" },
    },
    required: ["query"],
  },
  summarize: (input) => ({
    key: "agent.tools.searchMods",
    params: { query: input?.query },
  }),
  run: async (input) => {
    const limit = Math.min(
      MAX_SEARCH_RESULTS,
      Math.max(1, Number(input?.limit) || MAX_SEARCH_RESULTS),
    );

    const result = await api.modManager.search(
      String(input?.query ?? ""),
      normalizeProvider(input?.provider),
      {
        version: input?.minecraftVersion || undefined,
        loader: (input?.loader as Loader) || undefined,
        projectType: normalizeProjectType(input?.projectType),
        sort: "",
        filter: [],
      },
      { offset: 0, limit },
    );

    if (!result || result.error) {
      return { ok: false, error: "Search failed or the provider is offline" };
    }

    return {
      ok: true,
      data: {
        total: result.total,
        shown: Math.min(result.projects.length, limit),
        projects: result.projects.slice(0, limit).map((project) => ({
          id: project.id,
          provider: project.provider,
          title: wrapUntrusted(project.title),
          description: wrapUntrusted(truncate(project.description, 300)),
          type: project.projectType,
          downloads: project.stats?.downloads ?? null,
          url: project.url,
        })),
      },
    };
  },
};

export const getProject: AgentTool = {
  name: "get_project",
  risk: "read",
  description:
    "Get the full page of one project from Modrinth or CurseForge: long description, gallery and download stats. Use it when the user asks what a mod actually does.",
  parameters: {
    type: "object",
    properties: {
      provider: { type: "string", enum: PROVIDERS },
      projectId: { type: "string" },
    },
    required: ["provider", "projectId"],
  },
  summarize: (input) => ({
    key: "agent.tools.getProject",
    params: { id: input?.projectId },
  }),
  run: async (input) => {
    const project = await api.modManager.getProject(
      normalizeProvider(input?.provider),
      String(input?.projectId ?? ""),
    );

    if (!project) return { ok: false, error: "Project not found" };

    return {
      ok: true,
      data: {
        id: project.id,
        provider: project.provider,
        type: project.projectType,
        url: project.url,
        downloads: project.stats?.downloads ?? null,
        updated: project.stats?.dateModified ?? null,
        content: wrapUntrusted(
          `${project.title}\n\n${truncate(project.body || project.description, MAX_BODY_CHARS)}`,
        ),
      },
    };
  },
};

export const getProjectVersions: AgentTool = {
  name: "get_project_versions",
  risk: "read",
  description:
    "List the released files of a project that match a Minecraft version and loader. Use it to pick the exact version id to install.",
  parameters: {
    type: "object",
    properties: {
      provider: { type: "string", enum: PROVIDERS },
      projectId: { type: "string" },
      projectUrl: {
        type: "string",
        description: "The url returned by search_mods for this project",
      },
      minecraftVersion: { type: "string" },
      loader: {
        type: "string",
        enum: ["forge", "neoforge", "fabric", "quilt"],
      },
      projectType: { type: "string", enum: PROJECT_TYPES },
    },
    required: ["provider", "projectId"],
  },
  summarize: (input) => ({
    key: "agent.tools.getProjectVersions",
    params: { id: input?.projectId },
  }),
  run: async (input) => {
    const versions = await api.modManager.getVersions(
      normalizeProvider(input?.provider),
      String(input?.projectId ?? ""),
      {
        version: input?.minecraftVersion || undefined,
        loader: (input?.loader as Loader) || undefined,
        projectType: normalizeProjectType(input?.projectType),
        modUrl: String(input?.projectUrl ?? ""),
      },
    );

    const limited = limitList(versions ?? [], MAX_VERSIONS);

    return {
      ok: true,
      data: {
        total: limited.total,
        truncated: limited.truncated,
        versions: limited.items.map((version) => ({
          id: version.id,
          name: wrapUntrusted(version.name ?? ""),
          versionNumber: version.versionNumber ?? null,
          releaseType: version.releaseType ?? null,
          datePublished: version.datePublished ?? null,
          minecraftVersions: version.gameVersions ?? [],
          dependencies: version.dependencies ?? [],
          files: version.files?.map((file) => file.filename) ?? [],
        })),
      },
    };
  },
};

export const getDependencies: AgentTool = {
  name: "get_dependencies",
  risk: "read",
  description:
    "Resolve the dependency list of a project version into concrete projects, so you can tell the user what else will be installed.",
  parameters: {
    type: "object",
    properties: {
      provider: { type: "string", enum: PROVIDERS },
      projectId: { type: "string" },
      dependencies: {
        type: "array",
        description:
          "The dependencies array returned by get_project_versions for the chosen version",
        items: { type: "object" },
      },
    },
    required: ["provider", "projectId", "dependencies"],
  },
  summarize: (input) => ({
    key: "agent.tools.getDependencies",
    params: { id: input?.projectId },
  }),
  run: async (input) => {
    const deps = Array.isArray(input?.dependencies)
      ? (input.dependencies as IVersionDependency[])
      : [];

    const resolved = await api.modManager.getDependencies(
      normalizeProvider(input?.provider),
      String(input?.projectId ?? ""),
      deps,
    );

    return {
      ok: true,
      data: {
        dependencies: (resolved ?? []).map((dependency) => ({
          projectId: dependency.projectId ?? null,
          versionId: dependency.versionId ?? null,
          relation: dependency.relationType,
          title: dependency.project?.title
            ? wrapUntrusted(dependency.project.title)
            : null,
          provider: dependency.project?.provider ?? null,
        })),
      },
    };
  },
};
