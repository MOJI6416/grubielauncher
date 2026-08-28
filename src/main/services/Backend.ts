import {
  DirectUploadCompleteResponse,
  DirectUploadStartResponse,
  IExplorePage,
  IExploreQuery,
  IModpack,
  IModpackUpdate,
  UploadFileProgress,
} from "@/types/Backend";
import { IPublicProfile } from "@/types/Profile";
import {
  IFriendSettingsUpdate,
  IMutualFriends,
  INotificationPrefs,
  IUpdateUser,
  IUser,
} from "@/types/IUser";
import { BaseService } from "./Base";
import { INews, INewsPage, ISponsoredNewsAd } from "@/types/News";
import { IUpdateCheckRequest, IUpdateCheckResponse } from "@/types/Updates";
import {
  IAchievementReach,
  IGlobalLeaderboard,
  IOwnLeaderboardRank,
} from "@/types/Leaderboard";
import { IGrubieSkin } from "@/types/SkinManager";
import {
  IGuestStatsUploadRequest,
  IGuestStatsUploadResponse,
  IRemoteWorldStatsResponse,
} from "@/types/Achievements";
import FormData from "form-data";
import axios from "axios";
import fs from "fs-extra";
import path from "path";
import { reportFailure } from "../utilities/failureBus";
import { isTransientNetworkFailure } from "@/shared/errors";
import { toStorageUploadUrl } from "../utilities/mirrors";
import {
  IAiAnalysisResult,
  IAiFeedbackResult,
  IAiLogAnalysis,
  IAiLogRequest,
} from "@/types/AiAnalysis";
import { IAuthlib } from "@/types/IAuthlib";
import { RemoteAiChat, RemoteAiChatMessage } from "@/types/Agent";
import {
  ILauncherReleaseNote,
  ILauncherReleasePage,
} from "@/types/LauncherRelease";
import { IGroup, IVoiceTokenResponse } from "@/types/Voice";
import {
  ActiveFriendSharesResponse,
  ShareAccessResponse,
  ShareGatewayTokenResponse,
  ShareHeartbeatResponse,
  ShareJoinTicketResponse,
  ShareStartRequest,
  ShareStartResponse,
  ShareStopResponse,
  ShareVisibility,
} from "@/types/Share";

export class Backend extends BaseService {
  constructor(accessToken?: string) {
    super(accessToken);
  }

  private normalizeModpackVersion(
    version: IModpack["conf"]["version"] | string | any,
  ) {
    if (typeof version === "string") {
      return {
        id: version,
        type: "release",
        url: "",
        serverManager: false,
      };
    }

    return {
      id: String(version?.id || ""),
      type: String(version?.type || "release"),
      url: String(version?.url || ""),
      isNew: Boolean(version?.isNew),
      serverManager: Boolean(version?.serverManager),
    };
  }

  private normalizeModpackConf(conf: IModpack["conf"]) {
    return {
      ...conf,
      version: this.normalizeModpackVersion(conf.version),
    };
  }

  private async postModpackCreate(payload: unknown) {
    const send = () =>
      this.api.post<{ shareCode: string }>(`${this.baseUrl}/modpacks`, payload);

    try {
      return await send();
    } catch (error) {
      if (!isTransientNetworkFailure(error)) throw error;

      await new Promise((resolve) => setTimeout(resolve, 1500));
      return await send();
    }
  }

  async shareModpack(modpack: { conf: IModpack["conf"]; isPublic?: boolean }) {
    const normalizedModpack = {
      ...modpack,
      conf: this.normalizeModpackConf(modpack.conf),
    };

    const filteredMods =
      normalizedModpack.conf.loader.mods.length > 0
        ? normalizedModpack.conf.loader.mods.filter(
            (mod) => mod.projectType !== "plugin",
          )
        : normalizedModpack.conf.loader.mods;

    const payload =
      filteredMods === normalizedModpack.conf.loader.mods
        ? normalizedModpack
        : {
            ...normalizedModpack,
            conf: {
              ...normalizedModpack.conf,
              loader: {
                ...normalizedModpack.conf.loader,
                mods: filteredMods,
              },
            },
          };

    const response = await this.postModpackCreate(payload);

    const shareCode = response.data?.shareCode;
    if (typeof shareCode !== "string" || shareCode === "") {
      throw new Error(
        `Modpack create answered ${response.status} without a share code (content-type: ${
          response.headers?.["content-type"] ?? "none"
        })`,
      );
    }

    return shareCode;
  }

  async updateModpack(shareCode: string, update: IModpackUpdate) {
    const payload: IModpackUpdate =
      update.mods && update.mods.length > 0
        ? {
            ...update,
            mods: update.mods.filter((mod) => mod.projectType !== "plugin"),
          }
        : update;

    await this.api.patch(`${this.baseUrl}/modpacks/${shareCode}`, {
      ...payload,
    });

    return true;
  }

  async getModpack(shareCode: string): Promise<{
    status: "success" | "not_found" | "error";
    data: IModpack | null;
  }> {
    try {
      const response = await this.api.get<IModpack>(
        `${this.baseUrl}/modpacks/${shareCode}`,
      );

      return {
        status: "success",
        data: response.data,
      };
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        return { status: "not_found", data: null };
      }

      throw error;
    }
  }

  async exploreModpacks(query: IExploreQuery): Promise<IExplorePage | null> {
    const response = await this.api.get<IExplorePage>(
      `${this.baseUrl}/modpacks/explore`,
      {
        params: {
          offset: query.offset,
          limit: query.limit,
          sort: query.sort,
          q: query.q || undefined,
          loader: query.loader || undefined,
          mc: query.mc || undefined,
        },
      },
    );

    return response.data;
  }

  async getPublicProfile(
    nickname: string,
    userId?: string,
  ): Promise<IPublicProfile | null> {
    if (userId) {
      try {
        const byId = await this.api.get<IPublicProfile>(
          `${this.baseUrl}/profiles/id/${encodeURIComponent(userId)}`,
        );
        return byId.data;
      } catch (error: any) {
        if (error?.response?.status !== 404) throw error;
      }
    }

    const response = await this.api.get<IPublicProfile>(
      `${this.baseUrl}/profiles/${encodeURIComponent(nickname)}`,
    );

    return response.data;
  }

  async getOwnModpacks(): Promise<IModpack[]> {
    const response = await this.api.get<IModpack[]>(
      `${this.baseUrl}/modpacks/own`,
    );
    return response.data;
  }

  async deleteModpack(shareCode: string) {
    await this.api.delete(`${this.baseUrl}/modpacks/${shareCode}`);
    return true;
  }

  async updateUser(id: string, user: IUpdateUser) {
    const response = await this.api.patch<IUser>(
      `${this.baseUrl}/users/${id}`,
      user,
    );

    return response.data;
  }

  async getUser(id: string) {
    const response = await this.api.get<IUser>(`${this.baseUrl}/users/` + id);

    return response.data;
  }

  async getMutualFriends(id: string) {
    const response = await this.api.get<IMutualFriends>(
      `${this.baseUrl}/users/${id}/mutual-friends`,
    );

    return response.data;
  }

  async groupsList() {
    const response = await this.api.get<IGroup[]>(`${this.baseUrl}/groups`);

    return response.data;
  }

  async groupCreate(name: string) {
    const response = await this.api.post<IGroup>(`${this.baseUrl}/groups`, {
      name,
    });

    return response.data;
  }

  async groupRename(groupId: string, name: string) {
    const response = await this.api.patch<IGroup>(
      `${this.baseUrl}/groups/${groupId}`,
      { name },
    );

    return response.data;
  }

  async groupDelete(groupId: string) {
    await this.api.delete(`${this.baseUrl}/groups/${groupId}`);

    return true;
  }

  async groupJoinVoice(groupId: string) {
    const response = await this.api.post<IVoiceTokenResponse>(
      `${this.baseUrl}/groups/${groupId}/join`,
    );

    return response.data;
  }

  async groupJoinByCode(
    code: string,
  ): Promise<
    | IGroup
    | "banned"
    | "group_full"
    | "rate_limited"
    | "not_found"
    | "invalid_code"
  > {
    try {
      const response = await this.api.post<IGroup>(
        `${this.baseUrl}/groups/join-by-code`,
        { code },
      );

      return response.data;
    } catch (error: any) {
      const message = error?.response?.data?.message;
      if (message === "banned") return "banned";
      if (message === "group_full") return "group_full";
      if (message === "rate_limited") return "rate_limited";
      if (message === "group_not_found") return "not_found";
      if (message === "invalid_code") return "invalid_code";
      throw error;
    }
  }

  async groupLeave(groupId: string) {
    await this.api.post(`${this.baseUrl}/groups/${groupId}/leave`);

    return true;
  }

  async groupKickMember(groupId: string, memberId: string) {
    await this.api.delete(
      `${this.baseUrl}/groups/${groupId}/members/${memberId}`,
    );

    return true;
  }

  async groupBanMember(groupId: string, memberId: string) {
    await this.api.post(
      `${this.baseUrl}/groups/${groupId}/members/${memberId}/ban`,
    );

    return true;
  }

  async groupTransferOwner(groupId: string, memberId: string) {
    await this.api.post(
      `${this.baseUrl}/groups/${groupId}/owner/${memberId}`,
    );

    return true;
  }

  async groupUnbanMember(groupId: string, memberId: string) {
    await this.api.delete(
      `${this.baseUrl}/groups/${groupId}/bans/${memberId}`,
    );

    return true;
  }

  async groupResetCode(groupId: string) {
    const response = await this.api.post<IGroup>(
      `${this.baseUrl}/groups/${groupId}/code/reset`,
    );

    return response.data;
  }

  async resetFriendCode(id: string) {
    const response = await this.api.post<IUser>(
      `${this.baseUrl}/users/${id}/friend-code/reset`,
    );

    return response.data;
  }

  async updateFriendSettings(id: string, settings: IFriendSettingsUpdate) {
    const response = await this.api.patch<IUser>(
      `${this.baseUrl}/users/${id}/friend-settings`,
      settings,
    );

    return response.data;
  }

  async uploadFileFromPath(
    filePath: string,
    fileName?: string,
    folder?: string,
    onProgress?: (progress: Omit<UploadFileProgress, "id">) => void,
  ): Promise<string | null> {
    const fileSize = (await fs.stat(filePath).catch(() => null))?.size || 0;
    let uploadedBytes = 0;
    let lastProgressEmit = 0;

    const emitProgress = (
      progress: Partial<Omit<UploadFileProgress, "id">>,
    ) => {
      const loaded = progress.loaded ?? uploadedBytes;
      const total = progress.total ?? fileSize;
      onProgress?.({
        status: progress.status ?? "uploading",
        loaded,
        total,
        percent:
          typeof progress.percent === "number"
            ? progress.percent
            : total > 0
              ? Math.min(100, Math.round((loaded / total) * 100))
              : 0,
        statusCode: progress.statusCode,
        message: progress.message,
      });
    };

    try {
      emitProgress({ status: "preparing", loaded: 0, percent: 0 });

      const formData = new FormData();

      const stream = fs.createReadStream(filePath);

      formData.append("file", stream, {
        filename: fileName ?? path.basename(filePath),
        contentType: "application/octet-stream",
      });

      if (folder) formData.append("folder", folder);

      const response = await this.api.post<string>(
        `${this.baseUrl}/files/upload`,
        formData,
        {
          headers: formData.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 10 * 60 * 1000,
          onUploadProgress: (event) => {
            uploadedBytes = event.loaded;
            const now = Date.now();
            if (
              now - lastProgressEmit < 150 &&
              (!event.total || event.loaded < event.total)
            )
              return;
            lastProgressEmit = now;
            emitProgress({
              status: "uploading",
              loaded: event.loaded,
              total: event.total ?? fileSize,
            });
          },
        },
      );

      emitProgress({
        status: "completed",
        loaded: fileSize,
        total: fileSize,
        percent: 100,
      });

      return response.data;
    } catch (err) {
      const statusCode = (err as any)?.response?.status;
      const message =
        statusCode === 413
          ? "payload_too_large"
          : (err as any)?.message
            ? String((err as any).message)
            : "upload_failed";
      emitProgress({
        status: "error",
        statusCode,
        message,
      });
      console.error("Upload error:", {
        statusCode,
        code: (err as any)?.code,
        message,
      });
      reportFailure(err, { channel: "backend:uploadFile" });
      return null;
    }
  }

  async uploadFileFromPathDirect(
    filePath: string,
    fileName?: string,
    folder?: string,
    onProgress?: (progress: Omit<UploadFileProgress, "id">) => void,
  ): Promise<string | null> {
    const fileSize = (await fs.stat(filePath).catch(() => null))?.size || 0;
    const resolvedFileName = fileName ?? path.basename(filePath);
    let uploadedBytes = 0;
    let lastProgressEmit = 0;
    let directUploadStarted = false;

    const emitProgress = (
      progress: Partial<Omit<UploadFileProgress, "id">>,
    ) => {
      const loaded = progress.loaded ?? uploadedBytes;
      const total = progress.total ?? fileSize;
      onProgress?.({
        status: progress.status ?? "uploading",
        loaded,
        total,
        percent:
          typeof progress.percent === "number"
            ? progress.percent
            : total > 0
              ? Math.min(100, Math.round((loaded / total) * 100))
              : 0,
        statusCode: progress.statusCode,
        message: progress.message,
      });
    };

    try {
      emitProgress({ status: "preparing", loaded: 0, percent: 0 });

      const start = await this.api.post<DirectUploadStartResponse>(
        `${this.baseUrl}/files/direct-upload/start`,
        {
          fileName: resolvedFileName,
          folder,
          contentType: "application/octet-stream",
          size: fileSize,
        },
      );
      directUploadStarted = true;

      const putTo = (uploadUrl: string) =>
        axios.put(uploadUrl, fs.createReadStream(filePath), {
          headers: {
            ...start.data.headers,
            "Content-Length": fileSize,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 10 * 60 * 1000,
          onUploadProgress: (event) => {
            uploadedBytes = event.loaded;
            const now = Date.now();
            if (
              now - lastProgressEmit < 150 &&
              (!event.total || event.loaded < event.total)
            )
              return;
            lastProgressEmit = now;
            emitProgress({
              status: "uploading",
              loaded: event.loaded,
              total: event.total ?? fileSize,
            });
          },
        });

      try {
        await putTo(start.data.upload_url);
      } catch (error) {
        const viaMirror = toStorageUploadUrl(start.data.upload_url);
        if (!viaMirror || !isTransientNetworkFailure(error)) throw error;

        uploadedBytes = 0;
        emitProgress({ status: "uploading", loaded: 0, total: fileSize });
        await putTo(viaMirror);
      }

      const complete = await this.api.post<DirectUploadCompleteResponse>(
        `${this.baseUrl}/files/direct-upload/complete`,
        {
          object_key: start.data.object_key,
        },
      );

      emitProgress({
        status: "completed",
        loaded: fileSize,
        total: fileSize,
        percent: 100,
      });

      return complete.data.file_url || start.data.file_url;
    } catch (err) {
      const statusCode = (err as any)?.response?.status;
      if (!directUploadStarted && (statusCode === 404 || statusCode === 405)) {
        return await this.uploadFileFromPath(
          filePath,
          fileName,
          folder,
          onProgress,
        );
      }
      const message =
        statusCode === 413
          ? "payload_too_large"
          : (err as any)?.message
            ? String((err as any).message)
            : "direct_upload_failed";
      emitProgress({
        status: "error",
        statusCode,
        message,
      });
      console.error("Direct upload error:", {
        statusCode,
        code: (err as any)?.code,
        message,
      });
      reportFailure(err, { channel: "backend:uploadFileDirect" });
      return null;
    }
  }

  async deleteFile(key: string, isDirectory = false) {
    await this.api.delete(`${this.baseUrl}/files`, {
      data: { key, isDirectory },
    });
  }

  async modpackDownloaded(shareCode: string) {
    const response = await this.api.patch<{
      counted: boolean;
      reason?: string;
    }>(`${this.baseUrl}/modpacks/${shareCode}/downloaded`);
    return response.data.counted;
  }

  async getNews() {
    const response = await this.api.get<INews[]>(`${this.baseUrl}/news.json`);
    return response.data;
  }

  async getNewsPage(params: {
    limit?: number;
    cursor?: string;
    source?: string;
  }): Promise<INewsPage | null> {
    const response = await this.api.get<INewsPage>(`${this.baseUrl}/news`, {
      params: {
        ...(params.limit ? { limit: params.limit } : {}),
        ...(params.cursor ? { cursor: params.cursor } : {}),
        ...(params.source ? { source: params.source } : {}),
      },
    });
    return response.data;
  }

  async checkUpdates(
    request: IUpdateCheckRequest,
  ): Promise<IUpdateCheckResponse | null> {
    const response = await this.api.post<IUpdateCheckResponse>(
      `${this.baseUrl}/updates/check`,
      request,
    );
    return response.data;
  }

  async getGlobalLeaderboard(limit: number) {
    const response = await this.api.get<IGlobalLeaderboard>(
      `${this.baseUrl}/leaderboard`,
      { params: { limit } },
    );
    return response.data;
  }

  async getOwnLeaderboardRank() {
    const response = await this.api.get<IOwnLeaderboardRank | null>(
      `${this.baseUrl}/leaderboard/me`,
    );
    return response.data;
  }

  async getAchievementReach() {
    const response = await this.api.get<IAchievementReach>(
      `${this.baseUrl}/leaderboard/achievements`,
    );
    return response.data;
  }

  async getWhatsNew(version: string, locale: string) {
    const response = await this.api.get<ILauncherReleaseNote | null>(
      `${this.baseUrl}/launcher/releases/whats-new`,
      {
        params: {
          version,
          locale,
        },
      },
    );
    return response.data;
  }

  async getLauncherReleases(locale: string, limit: number) {
    const response = await this.api.get<ILauncherReleasePage>(
      `${this.baseUrl}/launcher/releases`,
      {
        params: {
          locale,
          limit,
        },
      },
    );
    return response.data;
  }

  async getSponsoredNewsAd(locale: string, hiddenIds: string[]) {
    const response = await this.api.get<ISponsoredNewsAd | null>(
      `${this.baseUrl}/ads/feed`,
      {
        params: {
          locale,
          hidden: hiddenIds.join(","),
        },
      },
    );
    return response.data;
  }

  async recordSponsoredAdImpression(id: string) {
    try {
      await this.api.post(`${this.baseUrl}/ads/${id}/impression`);
    } catch {}
  }

  async recordSponsoredAdClick(id: string) {
    try {
      await this.api.post(`${this.baseUrl}/ads/${id}/click`);
    } catch {}
  }

  async login(
    id: string,
    auth: {
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
    },
  ) {
    try {
      const response = await this.api.post<{ access_token: string }>(
        `${this.baseUrl}/auth/login`,
        {
          id,
          auth,
        },
      );

      return response.data.access_token;
    } catch {
      return null;
    }
  }

  async approveSiteLogin(requestId: string) {
    await this.api.post(`${this.baseUrl}/site-auth/approve`, { requestId });
    return true;
  }

  async declineSiteLogin(requestId: string) {
    await this.api.post(`${this.baseUrl}/site-auth/decline`, { requestId });
    return true;
  }

  async discordLink(code: string) {
    const response = await this.api.post<{
      discordId: string;
      username: string;
    }>(`${this.baseUrl}/auth/discord/link`, { code });
    return response.data;
  }

  async discordUnlink() {
    const response = await this.api.post<{
      discordId: null;
    }>(`${this.baseUrl}/auth/discord/unlink`, {});
    return response.data;
  }

  async telegramLinkStart() {
    const response = await this.api.post<{
      botUrl: string;
      expiresAt: string;
    }>(`${this.baseUrl}/auth/socials/telegram/start`, {});
    return response.data;
  }

  async telegramUnlink() {
    const response = await this.api.post<{
      provider: string;
      linked: null;
    }>(`${this.baseUrl}/auth/socials/telegram/unlink`, {});
    return response.data;
  }

  async updateNotifications(id: string, prefs: Partial<INotificationPrefs>) {
    const response = await this.api.patch<IUser>(
      `${this.baseUrl}/users/${id}/notifications`,
      prefs,
    );
    return response.data;
  }

  async getSkin(uuid: string) {
    try {
      const response = await this.api.get<IGrubieSkin>(
        `${this.baseUrl}/skins/${uuid}`,
      );
      return response.data;
    } catch {
      return null;
    }
  }

  async discordAuthenticated(userId: string) {
    try {
      const response = await this.api.put<boolean>(
        `${this.baseUrl}/discord/authenticated`,
        {
          userId,
        },
      );
      return response.data;
    } catch {
      return false;
    }
  }

  async aiComplete(prompt: string) {
    const response = await this.api.post<{ completion: string }>(
      `${this.baseUrl}/ai/complete`,
      {
        prompt,
      },
      {
        timeout: (this.api.defaults.timeout || 30000) * 2,
      },
    );
    return response.data.completion;
  }

  async listAiChats(): Promise<RemoteAiChat[] | null> {
    try {
      const response = await this.api.get<RemoteAiChat[]>(
        `${this.baseUrl}/ai/chats`,
      );
      return Array.isArray(response.data) ? response.data : [];
    } catch {
      return null;
    }
  }

  async createAiChat(payload: {
    title: string;
    provider?: string;
    model?: string;
  }): Promise<RemoteAiChat | null> {
    try {
      const response = await this.api.post<RemoteAiChat>(
        `${this.baseUrl}/ai/chats`,
        payload,
      );
      return response.data ?? null;
    } catch {
      return null;
    }
  }

  async updateAiChat(
    chatId: string,
    payload: { title?: string; pinned?: boolean },
  ): Promise<RemoteAiChat | null> {
    try {
      const response = await this.api.patch<RemoteAiChat>(
        `${this.baseUrl}/ai/chats/${chatId}`,
        payload,
      );
      return response.data ?? null;
    } catch {
      return null;
    }
  }

  async deleteAiChat(chatId: string): Promise<boolean> {
    try {
      await this.api.delete(`${this.baseUrl}/ai/chats/${chatId}`);
      return true;
    } catch {
      return false;
    }
  }

  async getAiChatMessages(
    chatId: string,
    after?: number,
  ): Promise<RemoteAiChatMessage[] | null> {
    try {
      const response = await this.api.get<{ messages: RemoteAiChatMessage[] }>(
        `${this.baseUrl}/ai/chats/${chatId}/messages`,
        { params: Number.isFinite(after) ? { after } : undefined },
      );
      return response.data?.messages ?? [];
    } catch {
      return null;
    }
  }

  async appendAiChatMessages(
    chatId: string,
    messages: RemoteAiChatMessage[],
  ): Promise<boolean> {
    try {
      await this.api.post(`${this.baseUrl}/ai/chats/${chatId}/messages`, {
        messages,
      });
      return true;
    } catch {
      return false;
    }
  }

  async getGameToken(): Promise<string | null> {
    try {
      const response = await this.api.post<{ access_token: string }>(
        `${this.baseUrl}/auth/game-token`,
        {},
      );

      return response.data?.access_token || null;
    } catch {
      return null;
    }
  }

  async getAuthlib() {
    try {
      const response = await this.api.get<IAuthlib>(
        `${this.baseUrl}/libs/authlib`,
      );
      return response.data;
    } catch {
      return null;
    }
  }

  async startShare(payload: ShareStartRequest) {
    const response = await this.api.post<ShareStartResponse>(
      `${this.baseUrl}/share/start`,
      payload,
    );
    return response.data;
  }

  async heartbeatShare(sessionId: string) {
    const response = await this.api.post<ShareHeartbeatResponse>(
      `${this.baseUrl}/share/heartbeat`,
      { sessionId },
    );
    return response.data;
  }

  async renewShareGatewayToken(sessionId: string) {
    const response = await this.api.post<ShareGatewayTokenResponse>(
      `${this.baseUrl}/share/${sessionId}/gateway-token`,
      {},
    );
    return response.data;
  }

  async updateShareVisibility(sessionId: string, visibility: ShareVisibility) {
    const response = await this.api.patch<ShareAccessResponse>(
      `${this.baseUrl}/share/${sessionId}/access`,
      { visibility },
    );
    return response.data;
  }

  async stopShare(sessionId: string) {
    const response = await this.api.post<ShareStopResponse>(
      `${this.baseUrl}/share/stop`,
      { sessionId },
    );
    return response.data;
  }

  async createJoinTicket(slug: string) {
    const response = await this.api.post<ShareJoinTicketResponse>(
      `${this.baseUrl}/share/${slug}/join-ticket`,
      {},
    );
    return response.data;
  }

  async getActiveFriendShares() {
    const response = await this.api.get<ActiveFriendSharesResponse>(
      `${this.baseUrl}/share/friends/active`,
    );
    return response.data.items;
  }

  async uploadGuestStats(sessionId: string, payload: IGuestStatsUploadRequest) {
    const response = await this.api.post<IGuestStatsUploadResponse>(
      `${this.baseUrl}/share/${sessionId}/guest-stats`,
      payload,
    );
    return response.data;
  }

  async getRemoteWorldStats() {
    const response = await this.api.get<IRemoteWorldStatsResponse>(
      `${this.baseUrl}/share/me/remote-stats`,
    );
    return response.data;
  }

  async analyzeCrashLog(
    request: IAiLogRequest,
    locale: string,
    launcherVersion: string,
  ): Promise<IAiAnalysisResult> {
    try {
      const response = await this.api.post<IAiLogAnalysis>(
        `${this.baseUrl}/ai/log-analysis`,
        {
          log: request.log,
          locale,
          launcherVersion,
          context: request.context,
        },
        { timeout: 120000 },
      );

      return { ok: true, analysis: response.data };
    } catch (error) {
      const status = (error as any)?.response?.status;

      if (status === 401 || status === 403) {
        return { ok: false, error: { reason: "unauthorized" } };
      }

      if (status === 429) {
        return { ok: false, error: { reason: "rateLimited" } };
      }

      return { ok: false, error: { reason: "unavailable" } };
    }
  }

  async sendCrashAnalysisFeedback(
    analysisId: string,
    helpful: boolean,
  ): Promise<IAiFeedbackResult> {
    try {
      const response = await this.api.post<{ counted?: boolean }>(
        `${this.baseUrl}/ai/log-analysis/feedback`,
        { analysisId, helpful },
      );

      return { ok: true, counted: response.data?.counted === true };
    } catch {
      return { ok: false, counted: false };
    }
  }
}
