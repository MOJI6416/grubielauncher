import {
  DirectUploadCompleteResponse,
  DirectUploadStartResponse,
  IModpack,
  IModpackUpdate,
  UploadFileProgress,
} from "@/types/Backend";
import {
  IFriendSettingsUpdate,
  ICreateUser,
  IUpdateUser,
  IUser,
} from "@/types/IUser";
import { BaseService } from "./Base";
import { INews, ISponsoredNewsAd } from "@/types/News";
import { IGrubieSkin } from "@/types/SkinManager";
import FormData from "form-data";
import axios from "axios";
import fs from "fs-extra";
import path from "path";
import { IAuthlib } from "@/types/IAuthlib";
import { ILauncherReleaseNote } from "@/types/LauncherRelease";
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

  async shareModpack(modpack: {
    conf: IModpack["conf"];
    isPublic?: boolean;
  }) {
    try {
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

      const response = await this.api.post<{ shareCode: string }>(
        `${this.baseUrl}/modpacks`,
        payload,
      );

      return response.data.shareCode;
    } catch (error) {
      throw error;
    }
  }

  async updateModpack(shareCode: string, update: IModpackUpdate) {
    try {
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
    } catch (error) {
      throw error;
    }
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
      } else {
        return { status: "error", data: null };
      }
    }
  }

  async getOwnModpacks(): Promise<IModpack[]> {
    try {
      const response = await this.api.get<IModpack[]>(
        `${this.baseUrl}/modpacks/own`,
      );
      return response.data;
    } catch {
      return [];
    }
  }

  async deleteModpack(shareCode: string) {
    try {
      await this.api.delete(`${this.baseUrl}/modpacks/${shareCode}`);
      return true;
    } catch {
      return false;
    }
  }

  async createUser(user: ICreateUser) {
    try {
      const response = await this.api.post<IUser>(`${this.baseUrl}/users`, {
        ...user,
      });

      return response.data;
    } catch {
      return null;
    }
  }

  async updateUser(id: string, user: IUpdateUser) {
    try {
      const response = await this.api.patch<IUser>(
        `${this.baseUrl}/users/${id}`,
        user,
      );

      return response.data;
    } catch (error) {
      return null;
    }
  }

  async getUser(id: string) {
    try {
      const response = await this.api.get<IUser>(`${this.baseUrl}/users/` + id);

      return response.data;
    } catch {
      return null;
    }
  }

  async resetFriendCode(id: string) {
    try {
      const response = await this.api.post<IUser>(
        `${this.baseUrl}/users/${id}/friend-code/reset`,
      );

      return response.data;
    } catch {
      return null;
    }
  }

  async updateFriendSettings(id: string, settings: IFriendSettingsUpdate) {
    try {
      const response = await this.api.patch<IUser>(
        `${this.baseUrl}/users/${id}/friend-settings`,
        settings,
      );

      return response.data;
    } catch {
      return null;
    }
  }

  async uploadFileFromPath(
    filePath: string,
    fileName?: string,
    folder?: string,
    onProgress?: (
      progress: Omit<UploadFileProgress, "id">,
    ) => void,
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
      stream.on("data", (chunk) => {
        uploadedBytes += Buffer.isBuffer(chunk)
          ? chunk.length
          : Buffer.byteLength(String(chunk));
        const now = Date.now();
        if (now - lastProgressEmit < 150 && uploadedBytes < fileSize) return;
        lastProgressEmit = now;
        emitProgress({ status: "uploading" });
      });

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
      return null;
    }
  }

  async uploadFileFromPathDirect(
    filePath: string,
    fileName?: string,
    folder?: string,
    onProgress?: (
      progress: Omit<UploadFileProgress, "id">,
    ) => void,
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

      const stream = fs.createReadStream(filePath);
      stream.on("data", (chunk) => {
        uploadedBytes += Buffer.isBuffer(chunk)
          ? chunk.length
          : Buffer.byteLength(String(chunk));
        const now = Date.now();
        if (now - lastProgressEmit < 150 && uploadedBytes < fileSize) return;
        lastProgressEmit = now;
        emitProgress({ status: "uploading" });
      });

      await axios.put(start.data.upload_url, stream, {
        headers: {
          ...start.data.headers,
          "Content-Length": fileSize,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 10 * 60 * 1000,
      });

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
      return null;
    }
  }

  async deleteFile(key: string, isDirectory = false) {
    try {
      await this.api.delete(`${this.baseUrl}/files`, {
        data: { key, isDirectory },
      });
    } catch {}
  }

  async modpackDownloaded(shareCode: string) {
    try {
      const response = await this.api.patch<{
        counted: boolean;
        reason?: string;
      }>(`${this.baseUrl}/modpacks/${shareCode}/downloaded`);
      return response.data.counted;
    } catch {
      return false;
    }
  }

  async getNews() {
    try {
      const response = await this.api.get<INews[]>(`${this.baseUrl}/news.json`);
      return response.data;
    } catch {
      return [];
    }
  }

  async getWhatsNew(version: string, locale: string) {
    try {
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
    } catch {
      return null;
    }
  }

  async getSponsoredNewsAd(locale: string, hiddenIds: string[]) {
    try {
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
    } catch {
      return null;
    }
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
    try {
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
}
