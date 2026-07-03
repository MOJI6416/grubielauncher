import type { IpcMainInvokeEvent } from "electron";
import { Backend } from "../services/Backend";
import { IFriendSettingsUpdate, IUpdateUser } from "@/types/IUser";
import { IModpack, IModpackUpdate } from "@/types/Backend";
import { VersionsService } from "../services/Versions";
import { handleSafe } from "../utilities/ipc";

export function registerBackendIpc() {
  handleSafe(
    "backend:getModpack",
    { status: "error", data: null as any },
    async (_, at: string, code: string) => {
      const backend = new Backend(at);
      return await backend.getModpack(code);
    },
  );

  handleSafe("backend:getOwnModpacks", [], async (_, at: string) => {
    const backend = new Backend(at);
    return await backend.getOwnModpacks();
  });

  handleSafe(
    "backend:shareModpack",
    null,
    async (_, at: string, modpack: { conf: IModpack["conf"] }) => {
      const backend = new Backend(at);
      return await backend.shareModpack(modpack);
    },
  );

  handleSafe(
    "backend:updateModpack",
    false,
    async (_, at: string, shareCode: string, update: IModpackUpdate) => {
      const backend = new Backend(at);
      await backend.updateModpack(shareCode, update);
      return true;
    },
  );

  handleSafe(
    "backend:deleteModpack",
    false,
    async (_, at: string, shareCode: string) => {
      const backend = new Backend(at);
      return await backend.deleteModpack(shareCode);
    },
  );

  handleSafe(
    "backend:updateUser",
    null,
    async (_, at: string, id: string, user: IUpdateUser) => {
      const backend = new Backend(at);
      return await backend.updateUser(id, user);
    },
  );

  handleSafe("backend:getUser", null, async (_, at: string, id: string) => {
    const backend = new Backend(at);
    return await backend.getUser(id);
  });

  handleSafe("backend:groupsList", null, async (_, at: string) => {
    const backend = new Backend(at);
    return await backend.groupsList();
  });

  handleSafe(
    "backend:groupCreate",
    null,
    async (_, at: string, name: string) => {
      const backend = new Backend(at);
      return await backend.groupCreate(name);
    },
  );

  handleSafe(
    "backend:groupRename",
    null,
    async (_, at: string, groupId: string, name: string) => {
      const backend = new Backend(at);
      return await backend.groupRename(groupId, name);
    },
  );

  handleSafe(
    "backend:groupDelete",
    false,
    async (_, at: string, groupId: string) => {
      const backend = new Backend(at);
      return await backend.groupDelete(groupId);
    },
  );

  handleSafe(
    "backend:groupJoinVoice",
    null,
    async (_, at: string, groupId: string) => {
      const backend = new Backend(at);
      return await backend.groupJoinVoice(groupId);
    },
  );

  handleSafe(
    "backend:groupJoinByCode",
    null,
    async (_, at: string, code: string) => {
      const backend = new Backend(at);
      return await backend.groupJoinByCode(code);
    },
  );

  handleSafe(
    "backend:groupLeave",
    false,
    async (_, at: string, groupId: string) => {
      const backend = new Backend(at);
      return await backend.groupLeave(groupId);
    },
  );

  handleSafe(
    "backend:groupKickMember",
    false,
    async (_, at: string, groupId: string, memberId: string) => {
      const backend = new Backend(at);
      return await backend.groupKickMember(groupId, memberId);
    },
  );

  handleSafe(
    "backend:groupBanMember",
    false,
    async (_, at: string, groupId: string, memberId: string) => {
      const backend = new Backend(at);
      return await backend.groupBanMember(groupId, memberId);
    },
  );

  handleSafe(
    "backend:groupUnbanMember",
    false,
    async (_, at: string, groupId: string, memberId: string) => {
      const backend = new Backend(at);
      return await backend.groupUnbanMember(groupId, memberId);
    },
  );

  handleSafe(
    "backend:groupTransferOwner",
    false,
    async (_, at: string, groupId: string, memberId: string) => {
      const backend = new Backend(at);
      return await backend.groupTransferOwner(groupId, memberId);
    },
  );

  handleSafe(
    "backend:groupResetCode",
    null,
    async (_, at: string, groupId: string) => {
      const backend = new Backend(at);
      return await backend.groupResetCode(groupId);
    },
  );

  handleSafe(
    "backend:resetFriendCode",
    null,
    async (_, at: string, id: string) => {
      const backend = new Backend(at);
      return await backend.resetFriendCode(id);
    },
  );

  handleSafe(
    "backend:updateFriendSettings",
    null,
    async (_, at: string, id: string, settings: IFriendSettingsUpdate) => {
      const backend = new Backend(at);
      return await backend.updateFriendSettings(id, settings);
    },
  );

  handleSafe(
    "backend:uploadFileFromPath",
    null,
    async (
      event: IpcMainInvokeEvent,
      at: string,
      filePath: string,
      fileName?: string,
      folder?: string,
      progressId?: string,
      direct = false,
    ) => {
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
    async (_, at: string, key: string, isDirectory = false) => {
      const backend = new Backend(at);
      await backend.deleteFile(key, isDirectory);
      return true;
    },
  );

  handleSafe(
    "backend:modpackDownloaded",
    false,
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
    async (_, version: string, locale: string) => {
      const backend = new Backend();
      return await backend.getWhatsNew(version, locale);
    },
  );

  handleSafe(
    "backend:getSponsoredNewsAd",
    null,
    async (_, locale: string, hiddenIds: string[]) => {
      const backend = new Backend();
      return await backend.getSponsoredNewsAd(locale, hiddenIds);
    },
  );

  handleSafe(
    "backend:recordSponsoredAdImpression",
    false,
    async (_, id: string) => {
      const backend = new Backend();
      await backend.recordSponsoredAdImpression(id);
      return true;
    },
  );

  handleSafe("backend:recordSponsoredAdClick", false, async (_, id: string) => {
    const backend = new Backend();
    await backend.recordSponsoredAdClick(id);
    return true;
  });

  handleSafe(
    "backend:login",
    null,
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

  handleSafe("backend:getSkin", null, async (_, at: string, uuid: string) => {
    const backend = new Backend(at);
    return await backend.getSkin(uuid);
  });

  handleSafe(
    "backend:discordAuthenticated",
    false,
    async (_, at: string, userId: string) => {
      const backend = new Backend(at);
      return await backend.discordAuthenticated(userId);
    },
  );

  handleSafe(
    "backend:aiComplete",
    null,
    async (_, at: string, prompt: string) => {
      const backend = new Backend(at);
      return await backend.aiComplete(prompt);
    },
  );

  handleSafe(
    "versions:getList",
    [],
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
}
