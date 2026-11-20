import fs from "fs-extra";
import path from "path";
import { randomUUID } from "crypto";
import { check, handleSafe } from "../utilities/ipc";
import { getDataRoot } from "../utilities/dataRoot";
import { accountSyncApi } from "../utilities/accountSyncClient";
import { imageKind } from "./themeIpc";
import { syncWardrobeQueued } from "./skinsIpc";
import { GALLERY_BACKDROP } from "@/shared/themeGallery";
import { normalizeRemoteTheme, type RemoteTheme } from "@/shared/themeSync";
import type { RemoteSettings } from "@/shared/settingsSync";
import type {
  SyncResult,
  ThemePushPayload,
  WardrobeSyncResult,
} from "@/types/AccountSync";

const isToken = check.nonEmptyString(32768);
const isRemoteId = check.pattern(/^[a-f0-9]{24}$/, 24);
const isUserId = check.pattern(/^[A-Za-z0-9_-]{1,64}$/, 64);

function asSettings(value: unknown): RemoteSettings {
  const raw = (value ?? {}) as Partial<RemoteSettings>;
  return {
    values: raw.values && typeof raw.values === "object" ? raw.values : {},
    stamps: raw.stamps && typeof raw.stamps === "object" ? raw.stamps : {},
  };
}

function themeForm(
  payload: ThemePushPayload,
  picture: Uint8Array | null,
  keepPicture: boolean,
): FormData {
  const form = new FormData();
  form.append("name", String(payload.name ?? "").slice(0, 40));
  form.append("mode", payload.mode === "light" ? "light" : "dark");
  form.append("colors", JSON.stringify(payload.colors ?? {}));
  form.append("changedAt", String(Math.floor(Number(payload.changedAt) || 1)));
  form.append("clientId", String(payload.clientId ?? "").slice(0, 64));
  if (payload.backdrop) {
    form.append("backdrop", JSON.stringify(payload.backdrop));
    if (picture) {
      form.append(
        "backdrop",
        new Blob([Buffer.from(picture)], { type: "image/webp" }),
        "backdrop.webp",
      );
    } else if (keepPicture) {
      form.append("keepPicture", "1");
    }
  }
  return form;
}

function isWebp(value: unknown): value is Uint8Array {
  return (
    value instanceof Uint8Array &&
    value.length <= GALLERY_BACKDROP.maxBytes &&
    imageKind(Buffer.from(value)) === "webp"
  );
}

export function registerAccountSyncIpc() {
  handleSafe<SyncResult<RemoteSettings>, [string, RemoteSettings]>(
    "sync:settings",
    { ok: false, reason: "failed" },
    [isToken, check.object(4)],
    async (_, token, payload) => {
      const result = await accountSyncApi.pushSettings(token, asSettings(payload));
      return result.ok ? { ok: true, data: asSettings(result.data) } : result;
    },
  );

  handleSafe<SyncResult<RemoteTheme[]>, [string]>(
    "sync:themes:list",
    { ok: false, reason: "failed" },
    [isToken],
    async (_, token) => {
      const result = await accountSyncApi.listThemes(token);
      if (!result.ok) return result;
      const items = Array.isArray(result.data?.items) ? result.data.items : [];
      return {
        ok: true,
        data: items
          .map(normalizeRemoteTheme)
          .filter((theme): theme is RemoteTheme => theme !== null),
      };
    },
  );

  handleSafe<
    SyncResult<RemoteTheme>,
    [string, string | null, ThemePushPayload, Uint8Array | null, boolean]
  >(
    "sync:themes:push",
    { ok: false, reason: "failed" },
    [isToken, check.optional(isRemoteId), check.object(8), check.any(), check.boolean()],
    async (_, token, remoteId, payload, picture, keepPicture) => {
      if (picture !== null && picture !== undefined && !isWebp(picture)) {
        return { ok: false, reason: "failed" };
      }
      const result = await accountSyncApi.pushTheme(
        token,
        remoteId ?? null,
        themeForm(payload, picture ?? null, keepPicture),
      );
      if (!result.ok) return result;
      const theme = normalizeRemoteTheme(result.data);
      return theme ? { ok: true, data: theme } : { ok: false, reason: "failed" };
    },
  );

  handleSafe<SyncResult<unknown>, [string, string]>(
    "sync:themes:delete",
    { ok: false, reason: "failed" },
    [isToken, isRemoteId],
    (_, token, remoteId) => accountSyncApi.deleteTheme(token, remoteId),
  );

  handleSafe<string | null, [string, string]>(
    "sync:themes:picture",
    null,
    [isToken, isRemoteId],
    async (_, token, remoteId) => {
      const result = await accountSyncApi.themePicture(token, remoteId, GALLERY_BACKDROP.maxBytes);
      if (!result.ok) return null;
      const data = Buffer.from(result.data);
      if (data.length > GALLERY_BACKDROP.maxBytes || imageKind(data) !== "webp") return null;

      const dir = path.join(getDataRoot(), "themes", "backdrops");
      await fs.ensureDir(dir);
      const target = path.join(dir, `${randomUUID()}.webp`);
      await fs.writeFile(target, data);
      return target;
    },
  );

  handleSafe<WardrobeSyncResult, [string, string, string]>(
    "sync:wardrobe",
    { ok: false, reason: "failed" },
    [isToken, check.nonEmptyString(4096), isUserId],
    (_, token, launcherPath, userId) => syncWardrobeQueued(launcherPath, token, userId),
  );
}
