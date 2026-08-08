import type { IpcMainInvokeEvent } from "electron";
import { Backend } from "../services/Backend";
import { IFriendSettingsUpdate, IUpdateUser } from "@/types/IUser";
import { IModpack, IModpackUpdate } from "@/types/Backend";
import { VersionsService } from "../services/Versions";
import { check, handleSafe } from "../utilities/ipc";
import { checkBackendHealth } from "../utilities/connectivityTest";
import { assertReadablePath } from "../utilities/safePath";
import { AI_PROMPT_MAX_CHARS } from "@/shared/config";

const isToken = check.string(32768);
const isId = check.nonEmptyString(256);
const isCode = check.nonEmptyString(512);
const isName = check.nonEmptyString(256);
const isPayload = check.object();
const isPath = check.nonEmptyString(4096);
const isLocale = check.string(16);
const isLoader = check.oneOf(
  "vanilla",
  "forge",
  "neoforge",
  "fabric",
  "quilt",
);

export function registerBackendIpc() {
  handleSafe(
    "backend:getModpack",
    { status: "error", data: null as any },
    [isToken, isCode],
    async (_, at: string, code: string) => {
      const backend = new Backend(at);
      return await backend.getModpack(code);
    },
  );

  handleSafe("backend:getOwnModpacks", [], [isToken], async (_, at: string) => {
    const backend = new Backend(at);
    return await backend.getOwnModpacks();
  });

  handleSafe(
    "backend:shareModpack",
    null,
    [isToken, isPayload],
    async (_, at: string, modpack: { conf: IModpack["conf"] }) => {
      const backend = new Backend(at);
      return await backend.shareModpack(modpack);
    },
  );

  handleSafe(
    "backend:updateModpack",
    false,
    [isToken, isCode, isPayload],
    async (_, at: string, shareCode: string, update: IModpackUpdate) => {
      const backend = new Backend(at);
      await backend.updateModpack(shareCode, update);
      return true;
    },
  );

  handleSafe(
    "backend:deleteModpack",
    false,
    [isToken, isCode],
    async (_, at: string, shareCode: string) => {
      const backend = new Backend(at);
      return await backend.deleteModpack(shareCode);
    },
  );

  handleSafe(
    "backend:updateUser",
    null,
    [isToken, isId, isPayload],
    async (_, at: string, id: string, user: IUpdateUser) => {
      const backend = new Backend(at);
      return await backend.updateUser(id, user);
    },
  );

  handleSafe(
    "backend:getUser",
    null,
    [isToken, isId],
    async (_, at: string, id: string) => {
      const backend = new Backend(at);
      return await backend.getUser(id);
    },
  );

  handleSafe(
    "backend:getRemoteStats",
    { worlds: [] },
    [isToken],
    async (_, at: string) => {
      const backend = new Backend(at);
      return await backend.getRemoteWorldStats();
    },
  );

  handleSafe("backend:groupsList", null, [isToken], async (_, at: string) => {
    const backend = new Backend(at);
    return await backend.groupsList();
  });

  handleSafe(
    "backend:groupCreate",
    null,
    [isToken, isName],
    async (_, at: string, name: string) => {
      const backend = new Backend(at);
      return await backend.groupCreate(name);
    },
  );

  handleSafe(
    "backend:groupRename",
    null,
    [isToken, isId, isName],
    async (_, at: string, groupId: string, name: string) => {
      const backend = new Backend(at);
      return await backend.groupRename(groupId, name);
    },
  );

  handleSafe(
    "backend:groupDelete",
    false,
    [isToken, isId],
    async (_, at: string, groupId: string) => {
      const backend = new Backend(at);
      return await backend.groupDelete(groupId);
    },
  );

  handleSafe(
    "backend:groupJoinVoice",
    null,
    [isToken, isId],
    async (_, at: string, groupId: string) => {
      const backend = new Backend(at);
      return await backend.groupJoinVoice(groupId);
    },
  );

  handleSafe(
    "backend:groupJoinByCode",
    null,
    [isToken, isCode],
    async (_, at: string, code: string) => {
      const backend = new Backend(at);
      return await backend.groupJoinByCode(code);
    },
  );

  handleSafe(
    "backend:groupLeave",
    false,
    [isToken, isId],
    async (_, at: string, groupId: string) => {
      const backend = new Backend(at);
      return await backend.groupLeave(groupId);
    },
  );

  handleSafe(
    "backend:groupKickMember",
    false,
    [isToken, isId, isId],
    async (_, at: string, groupId: string, memberId: string) => {
      const backend = new Backend(at);
      return await backend.groupKickMember(groupId, memberId);
    },
  );

  handleSafe(
    "backend:groupBanMember",
    false,
    [isToken, isId, isId],
    async (_, at: string, groupId: string, memberId: string) => {
      const backend = new Backend(at);
      return await backend.groupBanMember(groupId, memberId);
    },
  );

  handleSafe(
    "backend:groupUnbanMember",
    false,
    [isToken, isId, isId],
    async (_, at: string, groupId: string, memberId: string) => {
      const backend = new Backend(at);
      return await backend.groupUnbanMember(groupId, memberId);
    },
  );

  handleSafe(
    "backend:groupTransferOwner",
    false,
    [isToken, isId, isId],
    async (_, at: string, groupId: string, memberId: string) => {
      const backend = new Backend(at);
      return await backend.groupTransferOwner(groupId, memberId);
    },
  );

  handleSafe(
    "backend:groupResetCode",
    null,
    [isToken, isId],
    async (_, at: string, groupId: string) => {
      const backend = new Backend(at);
      return await backend.groupResetCode(groupId);
    },
  );

  handleSafe(
    "backend:resetFriendCode",
    null,
    [isToken, isId],
    async (_, at: string, id: string) => {
      const backend = new Backend(at);
      return await backend.resetFriendCode(id);
    },
  );

  handleSafe(
    "backend:updateFriendSettings",
    null,
    [isToken, isId, isPayload],
    async (_, at: string, id: string, settings: IFriendSettingsUpdate) => {
      const backend = new Backend(at);
      return await backend.updateFriendSettings(id, settings);
    },
  );

  handleSafe(
    "backend:uploadFileFromPath",
    null,
    [
      isToken,
      isPath,
      check.optional(check.string(256)),
      check.optional(check.string(256)),
      check.optional(check.string(256)),
      check.optional(check.boolean()),
    ],
    async (
      event: IpcMainInvokeEvent,
      at: string,
      filePath: string,
      fileName?: string,
      folder?: string,
      progressId?: string,
      direct = false,
    ) => {
      assertReadablePath(filePath, "backend:uploadFileFromPath");
      const backend = new Backend(at);
      const upload = direct
        ? backend.uploadFileFromPathDirect.bind(backend)
        : backend.uploadFileFromPath.bind(backend);
      return await upload(
        filePath,
        fileName,
        folder,
        progressId
          ? (progress) => {
              event.sender.send("backend:uploadFileProgress", {
                id: progressId,
                ...progress,
              });
            }
          : undefined,
      );
    },
  );

  handleSafe(
    "backend:deleteFile",
    false,
    [isToken, check.nonEmptyString(1024), check.optional(check.boolean())],
    async (_, at: string, key: string, isDirectory = false) => {
      const backend = new Backend(at);
      await backend.deleteFile(key, isDirectory);
      return true;
    },
  );

  handleSafe(
    "backend:modpackDownloaded",
    false,
    [isToken, isCode],
    async (_, at: string, shareCode: string) => {
      const backend = new Backend(at);
      return await backend.modpackDownloaded(shareCode);
    },
  );

  handleSafe("backend:getNews", [], async () => {
    const backend = new Backend();
    return await backend.getNews();
  });

  handleSafe(
    "backend:getWhatsNew",
    null,
    [check.string(64), isLocale],
    async (_, version: string, locale: string) => {
      const backend = new Backend();
      return await backend.getWhatsNew(version, locale);
    },
  );

  handleSafe(
    "backend:getSponsoredNewsAd",
    null,
    [isLocale, check.optional(check.arrayOf(isId, 1000))],
    async (_, locale: string, hiddenIds: string[]) => {
      const backend = new Backend();
      return await backend.getSponsoredNewsAd(locale, hiddenIds);
    },
  );

  handleSafe(
    "backend:recordSponsoredAdImpression",
    false,
    [isId],
    async (_, id: string) => {
      const backend = new Backend();
      await backend.recordSponsoredAdImpression(id);
      return true;
    },
  );

  handleSafe(
    "backend:recordSponsoredAdClick",
    false,
    [isId],
    async (_, id: string) => {
      const backend = new Backend();
      await backend.recordSponsoredAdClick(id);
      return true;
    },
  );

  handleSafe(
    "backend:login",
    null,
    [isToken, isId, isPayload],
    async (
      _,
      at: string,
      id: string,
      auth: {
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
      },
    ) => {
      const backend = new Backend(at);
      return await backend.login(id, auth);
    },
  );

  handleSafe(
    "backend:approveSiteLogin",
    false,
    [isToken, isId],
    async (_, at: string, requestId: string) => {
      const backend = new Backend(at);
      return await backend.approveSiteLogin(requestId);
    },
  );

  handleSafe(
    "backend:discordLink",
    null,
    [isToken, isCode],
    async (_, at: string, code: string) => {
      const backend = new Backend(at);
      return await backend.discordLink(code);
    },
  );

  handleSafe(
    "backend:discordUnlink",
    null,
    [isToken],
    async (_, at: string) => {
      const backend = new Backend(at);
      return await backend.discordUnlink();
    },
  );

  handleSafe(
    "backend:telegramLinkStart",
    null,
    [isToken],
    async (_, at: string) => {
      const backend = new Backend(at);
      return await backend.telegramLinkStart();
    },
  );

  handleSafe(
    "backend:socialLink",
    null,
    [isToken, check.nonEmptyString(32), isCode],
    async (_, at: string, provider: string, code: string) => {
      const backend = new Backend(at);
      return await backend.socialLink(provider, code);
    },
  );

  handleSafe(
    "backend:socialUnlink",
    null,
    [isToken, check.nonEmptyString(32)],
    async (_, at: string, provider: string) => {
      const backend = new Backend(at);
      return await backend.socialUnlink(provider);
    },
  );

  handleSafe(
    "backend:getSkin",
    null,
    [isToken, isId],
    async (_, at: string, uuid: string) => {
      const backend = new Backend(at);
      return await backend.getSkin(uuid);
    },
  );

  handleSafe(
    "backend:discordAuthenticated",
    false,
    [isToken, isId],
    async (_, at: string, userId: string) => {
      const backend = new Backend(at);
      return await backend.discordAuthenticated(userId);
    },
  );

  handleSafe(
    "backend:aiComplete",
    null,
    [isToken, check.nonEmptyString(AI_PROMPT_MAX_CHARS)],
    async (_, at: string, prompt: string) => {
      const backend = new Backend(at);
      return await backend.aiComplete(prompt);
    },
  );

  handleSafe(
    "versions:getList",
    [],
    [isLoader, check.optional(check.boolean())],
    async (
      _,
      loader: "vanilla" | "forge" | "neoforge" | "fabric" | "quilt",
      includeSnapshots = false,
    ) => {
      return await VersionsService.getVersions(loader, includeSnapshots);
    },
  );

  handleSafe(
    "versions:getLoaderVersions",
    [],
    [isLoader, check.nonEmptyString(64)],
    async (
      _,
      loader: "forge" | "neoforge" | "fabric" | "quilt",
      mcVersion: string,
    ) => {
      return await VersionsService.getLoaderVersions(loader, mcVersion);
    },
  );

  handleSafe("backend:getAuthlib", null, async () => {
    const backend = new Backend();
    return await backend.getAuthlib();
  });

  handleSafe("backend:checkHealth", false, async () => {
    return await checkBackendHealth();
  });
}
