import type { IpcMainInvokeEvent } from "electron";
import { Backend } from "../services/Backend";
import {
  IFriendSettingsUpdate,
  INotificationPrefs,
  IUpdateUser,
} from "@/types/IUser";
import {
  ExploreSort,
  IExploreQuery,
  IModpack,
  IModpackUpdate,
} from "@/types/Backend";
import { IUpdateCheckRequest, UPDATE_CHECK_MAX_ITEMS } from "@/types/Updates";
import { VersionsService } from "../services/Versions";
import { check, handleSafe } from "../utilities/ipc";
import { checkBackendHealth } from "../utilities/connectivityTest";
import { assertReadablePath } from "../utilities/safePath";
import {
  AI_PROMPT_MAX_CHARS,
  LAUNCHER_RELEASES_MAX,
  NEWS_PAGE_MAX,
} from "@/shared/config";
import { getApiBaseUrl, onApiBaseUrlChange } from "../utilities/apiHost";
import { BACKEND_URL } from "@/shared/config";
import { BrowserWindow } from "electron";

const isToken = check.string(32768);
const isId = check.nonEmptyString(256);
const isCode = check.nonEmptyString(512);
const isName = check.nonEmptyString(256);
const isPayload = check.object();
const isPath = check.nonEmptyString(4096);
const isLocale = check.string(16);
const isLoader = check.oneOf("vanilla", "forge", "neoforge", "fabric", "quilt");

const EXPLORE_MAX_LIMIT = 24;

function isExploreSort(value: unknown): value is ExploreSort {
  return value === "downloads" || value === "updated" || value === "new";
}

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

  handleSafe(
    "backend:getOwnModpacks",
    null,
    [isToken],
    async (_, at: string) => {
      const backend = new Backend(at);
      return await backend.getOwnModpacks();
    },
  );

  handleSafe(
    "backend:exploreModpacks",
    null,
    [isPayload],
    async (_, query: IExploreQuery) => {
      const backend = new Backend();
      return await backend.exploreModpacks({
        offset: Math.max(0, Math.trunc(Number(query.offset) || 0)),
        limit: Math.min(
          EXPLORE_MAX_LIMIT,
          Math.max(1, Math.trunc(Number(query.limit) || EXPLORE_MAX_LIMIT)),
        ),
        sort: isExploreSort(query.sort) ? query.sort : "downloads",
        q: String(query.q || "").slice(0, 64),
        loader: String(query.loader || "").slice(0, 24),
        mc: String(query.mc || "").slice(0, 24),
      });
    },
  );

  handleSafe(
    "backend:getPublicProfile",
    null,
    [check.nonEmptyString(32), check.optional(check.string(64))],
    async (_, nickname: string, userId?: string) => {
      const backend = new Backend();
      return await backend.getPublicProfile(nickname, userId);
    },
  );

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
    "backend:getMutualFriends",
    null,
    [isToken, isId],
    async (_, at: string, id: string) => {
      const backend = new Backend(at);
      return await backend.getMutualFriends(id);
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
    "backend:getNewsPage",
    null,
    [isPayload],
    async (_, params: { limit?: number; cursor?: string; source?: string }) => {
      const backend = new Backend();
      return await backend.getNewsPage({
        limit: Number.isSafeInteger(params.limit)
          ? Math.min(NEWS_PAGE_MAX, Math.max(1, params.limit as number))
          : undefined,
        cursor: typeof params.cursor === "string" ? params.cursor : undefined,
        source: typeof params.source === "string" ? params.source : undefined,
      });
    },
  );

  handleSafe(
    "backend:checkUpdates",
    null,
    [isPayload],
    async (_, request: IUpdateCheckRequest) => {
      if (
        !Array.isArray(request.items) ||
        request.items.length === 0 ||
        request.items.length > UPDATE_CHECK_MAX_ITEMS
      ) {
        throw new Error(
          `backend:checkUpdates expects 1..${UPDATE_CHECK_MAX_ITEMS} items`,
        );
      }

      const backend = new Backend();
      return await backend.checkUpdates(request);
    },
  );

  handleSafe(
    "backend:getGlobalLeaderboard",
    null,
    [check.integer()],
    async (_, limit: number) => {
      const backend = new Backend();
      return await backend.getGlobalLeaderboard(
        Math.min(100, Math.max(1, limit)),
      );
    },
  );

  handleSafe(
    "backend:getOwnLeaderboardRank",
    null,
    [isToken],
    async (_, at: string) => {
      const backend = new Backend(at);
      return await backend.getOwnLeaderboardRank();
    },
  );

  handleSafe("backend:getAchievementReach", null, [], async () => {
    const backend = new Backend();
    return await backend.getAchievementReach();
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
    "backend:getLauncherReleases",
    null,
    [isLocale, check.integer()],
    async (_, locale: string, limit: number) => {
      const backend = new Backend();
      return await backend.getLauncherReleases(
        locale,
        Math.min(LAUNCHER_RELEASES_MAX, Math.max(1, limit)),
      );
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
    "backend:approveSiteLogin",
    false,
    [isToken, isId],
    async (_, at: string, requestId: string) => {
      const backend = new Backend(at);
      return await backend.approveSiteLogin(requestId);
    },
  );

  handleSafe(
    "backend:declineSiteLogin",
    false,
    [isToken, isId],
    async (_, at: string, requestId: string) => {
      const backend = new Backend(at);
      return await backend.declineSiteLogin(requestId);
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
    "backend:telegramUnlink",
    null,
    [isToken],
    async (_, at: string) => {
      const backend = new Backend(at);
      return await backend.telegramUnlink();
    },
  );

  handleSafe(
    "backend:updateNotifications",
    null,
    [isToken, isId, isPayload],
    async (_, at: string, id: string, prefs: Partial<INotificationPrefs>) => {
      const backend = new Backend(at);
      return await backend.updateNotifications(id, prefs);
    },
  );

  onApiBaseUrlChange((baseUrl) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
      window.webContents.send("api:baseUrl", baseUrl);
    }
  });

  handleSafe("backend:apiBaseUrl", BACKEND_URL, async () => getApiBaseUrl());

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
    null,
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
    null,
    [isLoader, check.nonEmptyString(64)],
    async (
      _,
      loader: "forge" | "neoforge" | "fabric" | "quilt",
      mcVersion: string,
    ) => {
      return await VersionsService.getLoaderVersions(loader, mcVersion);
    },
  );

  handleSafe("backend:checkHealth", false, async () => {
    return await checkBackendHealth();
  });
}
