import axios from "axios";
import { attachApiHostFallback } from "./apiHost";
import type {
  AccountSyncFailure,
  RemoteWardrobeItem,
  SyncResult,
} from "@/types/AccountSync";

const client = attachApiHostFallback(axios.create({ timeout: 30000 }));

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export function syncFailure(error: unknown): AccountSyncFailure {
  if (!axios.isAxiosError(error)) return "failed";
  const status = error.response?.status;
  if (!error.response) return "offline";
  if (status === 401) return "unauthorized";
  if (status === 404 || status === 405) return "unsupported";
  const code = (error.response.data as { code?: unknown } | undefined)?.code;
  if (code === "duplicate") return "duplicate";
  if (code === "data_required") return "data_required";
  if (code === "limit") return "limit";
  return "failed";
}

export async function request<T>(
  token: string,
  run: (headers: Record<string, string>) => Promise<{ data: T }>,
): Promise<SyncResult<T>> {
  try {
    const response = await run(auth(token));
    return { ok: true, data: response.data };
  } catch (error) {
    const reason = syncFailure(error);
    const data = axios.isAxiosError(error)
      ? (error.response?.data as { id?: unknown } | undefined)
      : undefined;
    return {
      ok: false,
      reason,
      ...(reason === "duplicate" && typeof data?.id === "string" ? { id: data.id } : {}),
    };
  }
}

export const accountSyncApi = {
  pushSettings(token: string, body: unknown) {
    return request<unknown>(token, (headers) => client.put("/sync/settings", body, { headers }));
  },

  listThemes(token: string) {
    return request<{ items?: unknown }>(token, (headers) =>
      client.get("/sync/themes", { headers }),
    );
  },

  pushTheme(token: string, remoteId: string | null, form: FormData) {
    return request<unknown>(token, (headers) =>
      remoteId
        ? client.put(`/sync/themes/${remoteId}`, form, { headers, timeout: 120000 })
        : client.post("/sync/themes", form, { headers, timeout: 120000 }),
    );
  },

  deleteTheme(token: string, remoteId: string) {
    return request<unknown>(token, (headers) =>
      client.delete(`/sync/themes/${remoteId}`, { headers }),
    );
  },

  themePicture(token: string, remoteId: string, maxBytes: number) {
    return request<ArrayBuffer>(token, (headers) =>
      client.get(`/sync/themes/${remoteId}/backdrop`, {
        headers,
        responseType: "arraybuffer",
        timeout: 120000,
        maxContentLength: maxBytes,
      }),
    );
  },

  listWardrobe(token: string) {
    return request<{ items?: RemoteWardrobeItem[] }>(token, (headers) =>
      client.get("/sync/wardrobe", { headers }),
    );
  },

  putWardrobeItem(
    token: string,
    kind: "skin" | "cape",
    hash: string,
    body: Record<string, unknown>,
  ) {
    return request<RemoteWardrobeItem>(token, (headers) =>
      client.put(`/sync/wardrobe/${kind}/${hash}`, body, { headers }),
    );
  },

  wardrobeTexture(token: string, kind: "skin" | "cape", hash: string, maxBytes: number) {
    return request<ArrayBuffer>(token, (headers) =>
      client.get(`/sync/wardrobe/${kind}/${hash}/texture`, {
        headers,
        responseType: "arraybuffer",
        maxContentLength: maxBytes,
      }),
    );
  },

  deleteWardrobeItem(token: string, kind: "skin" | "cape", hash: string) {
    return request<unknown>(token, (headers) =>
      client.delete(`/sync/wardrobe/${kind}/${hash}`, { headers }),
    );
  },
};
