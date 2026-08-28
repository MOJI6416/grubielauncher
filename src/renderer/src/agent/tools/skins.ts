import { getDefaultStore } from "jotai";
import { SkinsData } from "@/types/SkinManager";
import { accountAtom, authDataAtom, pathsAtom } from "@renderer/stores/atoms";
import { AgentTool } from "../types";
import { limitList, wrapUntrusted } from "../untrusted";

const api = window.api;

const MAX_SKINS = 30;
const SKIN_PLATFORMS = ["microsoft", "discord", "elyby"];

type SkinContext = {
  launcherPath: string;
  platform: "microsoft" | "discord" | "elyby";
  uuid: string;
  nickname: string;
  accessToken: string;
};

function skinContext(): SkinContext | string {
  const store = getDefaultStore();
  const account = store.get(accountAtom);
  const authData = store.get(authDataAtom);
  const paths = store.get(pathsAtom);

  if (!account) return "No account is selected";
  if (!SKIN_PLATFORMS.includes(account.type)) {
    return `Skins are not available for a ${account.type} account`;
  }
  if (!authData) return "The account is not authenticated yet";

  return {
    launcherPath: paths.launcher,
    platform: account.type as SkinContext["platform"],
    uuid: authData.uuid || "",
    nickname: account.nickname || "",
    accessToken:
      account.type === "microsoft"
        ? authData.auth?.accessToken || ""
        : account.accessToken || "",
  };
}

async function loadSkins(context: SkinContext): Promise<SkinsData | null> {
  return await api.skins.load(
    context.launcherPath,
    context.platform,
    context.uuid,
    context.nickname,
    context.accessToken,
  );
}

function serialize(data: SkinsData | null) {
  const limited = limitList(data?.skins?.skins ?? [], MAX_SKINS);

  return {
    selected: data?.selectedSkin ?? null,
    activeModel: data?.activeModel ?? null,
    total: limited.total,
    truncated: limited.truncated,
    skins: limited.items.map((skin) => ({
      id: skin.id,
      name: wrapUntrusted(skin.name ?? ""),
      model: skin.model,
      hasCape: Boolean(skin.capeId),
    })),
  };
}

export const listSkins: AgentTool = {
  name: "list_skins",
  risk: "read",
  description:
    "List the skins saved in the user's launcher skin library, and which one is currently worn.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  summarize: () => ({ key: "agent.tools.listSkins" }),
  run: async () => {
    const context = skinContext();
    if (typeof context === "string") return { ok: false, error: context };

    return { ok: true, data: serialize(await loadSkins(context)) };
  },
};

export const selectSkin: AgentTool = {
  name: "select_skin",
  risk: "write",
  description:
    "Wear one of the skins already in the library. Pass the id returned by list_skins.",
  parameters: {
    type: "object",
    properties: {
      skinId: { type: "string", description: "Id from list_skins" },
    },
    required: ["skinId"],
  },
  summarize: (input) => ({
    key: "agent.tools.selectSkin",
    params: { id: input?.skinId },
  }),
  run: async (input) => {
    const context = skinContext();
    if (typeof context === "string") return { ok: false, error: context };

    const skinId = String(input?.skinId ?? "").trim();
    if (skinId === "") return { ok: false, error: "skinId is required" };

    const data = await api.skins.selectSkin(
      context.uuid,
      context.platform,
      skinId,
    );

    if (!data) return { ok: false, error: "The launcher refused the skin" };

    return { ok: true, data: serialize(data) };
  },
};

export const importSkinByNickname: AgentTool = {
  name: "import_skin_by_nickname",
  risk: "write",
  description:
    "Download another player's skin into the library by their Minecraft nickname. It is only added, not worn — call select_skin afterwards if the user wants to put it on.",
  parameters: {
    type: "object",
    properties: {
      nickname: { type: "string", description: "Minecraft nickname" },
    },
    required: ["nickname"],
  },
  summarize: (input) => ({
    key: "agent.tools.importSkinByNickname",
    params: { name: input?.nickname },
  }),
  run: async (input) => {
    const context = skinContext();
    if (typeof context === "string") return { ok: false, error: context };

    const nickname = String(input?.nickname ?? "").trim();
    if (nickname === "") return { ok: false, error: "nickname is required" };

    const data = await api.skins.importByNickname(
      context.uuid,
      context.platform,
      nickname,
    );

    if (!data) {
      return {
        ok: false,
        error: `Could not fetch a skin for "${nickname}". The player may not exist or have no custom skin.`,
      };
    }

    return { ok: true, data: serialize(data) };
  },
};
