import { app, BrowserWindow, dialog } from "electron";
import AdmZip from "adm-zip";
import axios from "axios";
import fs from "fs-extra";
import path from "path";
import { randomUUID } from "crypto";
import { check, handleSafe } from "../utilities/ipc";
import { assertReadablePath } from "../utilities/safePath";
import { getDataRoot } from "../utilities/dataRoot";
import { attachApiHostFallback } from "../utilities/apiHost";
import {
  BACKDROP_ENTRY,
  THEME_FILE_EXTENSION,
  THEME_FILE_FORMAT,
} from "@/shared/themeFile";
import {
  GALLERY_BACKDROP,
  GALLERY_ID,
  GALLERY_PAGE_SIZE,
  GALLERY_THUMB,
  normalizeGalleryTheme,
  normalizePublishedTheme,
  type GalleryPage,
  type GalleryQuery,
  type GalleryTheme,
  type PublishError,
  type PublishImages,
  type PublishPayload,
  type PublishResult,
  type PublishedTheme,
} from "@/shared/themeGallery";

const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

type ExportResult = "saved" | "cancelled" | "failed";
type ImportResult = { manifest: unknown; backdropPath: string | null } | null;
type InstallResult = { theme: GalleryTheme; backdropPath: string | null } | null;

const PUBLISH_ERRORS: PublishError[] = [
  "publish_banned",
  "unreadable",
  "pending_limit",
  "duplicate",
  "bad_picture",
  "name_required",
];

const backendApi = attachApiHostFallback(axios.create({ timeout: 30000 }));

const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

async function saveBackdrop(data: Buffer, kind: string): Promise<string> {
  const dir = path.join(getDataRoot(), "themes", "backdrops");
  await fs.ensureDir(dir);
  const target = path.join(dir, `${randomUUID()}.${kind}`);
  await fs.writeFile(target, data);
  return target;
}

function isWebpBytes(value: unknown, maxBytes: number): value is Uint8Array {
  return (
    value instanceof Uint8Array &&
    value.length <= maxBytes &&
    imageKind(Buffer.from(value)) === "webp"
  );
}

export function publishFailure(error: unknown): PublishResult {
  if (!axios.isAxiosError(error)) return { ok: false, error: "failed" };
  if (!error.response) return { ok: false, error: "offline" };
  const data = (error.response.data ?? {}) as {
    code?: unknown;
    dupStatus?: unknown;
    reason?: unknown;
  };
  const code = PUBLISH_ERRORS.find((item) => item === data.code);
  if (!code) return { ok: false, error: "failed" };
  return {
    ok: false,
    error: code,
    dupStatus:
      data.dupStatus === "pending" || data.dupStatus === "approved" || data.dupStatus === "rejected"
        ? data.dupStatus
        : undefined,
    reason: typeof data.reason === "string" ? data.reason : null,
  };
}

export function imageKind(data: Buffer): "png" | "jpg" | "webp" | null {
  if (data.length < 12) return null;
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpg";
  if (
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

const FORBIDDEN_NAME_CHARS = '<>:"/\\|?*';

function safeStem(name: string): string {
  const stem = Array.from(name)
    .filter((char) => char.charCodeAt(0) >= 32 && !FORBIDDEN_NAME_CHARS.includes(char))
    .join("")
    .trim()
    .slice(0, 60);
  return stem || "theme";
}

function isManifest(value: unknown): value is {
  name?: unknown;
  backdrop?: { file?: unknown } | null;
} {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { format?: unknown }).format === THEME_FILE_FORMAT
  );
}

export function registerThemeIpc() {
  handleSafe<ExportResult, [unknown, string | null]>(
    "theme:export",
    "failed",
    async (event, manifest, backdropPath) => {
      if (!isManifest(manifest)) return "failed";
      const json = Buffer.from(JSON.stringify(manifest, null, 2), "utf-8");
      if (json.length > MAX_MANIFEST_BYTES) return "failed";

      const zip = new AdmZip();
      zip.addFile("theme.json", json);

      const entry = manifest.backdrop?.file;
      if (backdropPath && typeof entry === "string" && BACKDROP_ENTRY.test(entry)) {
        assertReadablePath(backdropPath, "theme:export");
        const data = await fs.readFile(backdropPath);
        if (data.length > MAX_IMAGE_BYTES || !imageKind(data)) return "failed";
        zip.addFile(entry, data);
      }

      const window = BrowserWindow.fromWebContents(event.sender);
      const options: Electron.SaveDialogOptions = {
        defaultPath: path.join(
          app.getPath("downloads"),
          `${safeStem(String(manifest.name ?? ""))}.${THEME_FILE_EXTENSION}`,
        ),
        filters: [{ name: "Grubie theme", extensions: [THEME_FILE_EXTENSION] }],
      };
      const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return "cancelled";

      await fs.writeFile(result.filePath, zip.toBuffer());
      return "saved";
    },
  );

  handleSafe<GalleryPage | null, [GalleryQuery]>(
    "theme:galleryList",
    null,
    [check.object(8)],
    async (_, query) => {
      const params: Record<string, string> = {
        page: String(Math.max(1, Math.floor(Number(query.page)) || 1)),
        limit: String(GALLERY_PAGE_SIZE),
      };
      if (typeof query.search === "string" && query.search.trim()) {
        params.search = query.search.trim().slice(0, 64);
      }
      if (query.mode === "dark" || query.mode === "light") params.mode = query.mode;
      if (query.sort === "downloads") params.sort = "downloads";

      const response = await backendApi.get<{ items?: unknown; total?: unknown }>("/themes", {
        params,
      });
      const items = (Array.isArray(response.data.items) ? response.data.items : [])
        .map(normalizeGalleryTheme)
        .filter((item): item is GalleryTheme => item !== null);
      return {
        items,
        total: typeof response.data.total === "number" ? response.data.total : items.length,
      };
    },
  );

  handleSafe<GalleryTheme | null, [string]>(
    "theme:galleryGet",
    null,
    [check.pattern(GALLERY_ID, 24)],
    async (_, id) => {
      const response = await backendApi.get(`/themes/${id}`);
      return normalizeGalleryTheme(response.data);
    },
  );

  handleSafe<InstallResult, [string]>(
    "theme:galleryInstall",
    null,
    [check.pattern(GALLERY_ID, 24)],
    async (_, id) => {
      const response = await backendApi.get(`/themes/${id}`);
      const theme = normalizeGalleryTheme(response.data);
      if (!theme) return null;

      let backdropPath: string | null = null;
      if (theme.backdrop) {
        const picture = await axios.get<ArrayBuffer>(theme.backdrop.url, {
          responseType: "arraybuffer",
          timeout: 60000,
          maxContentLength: GALLERY_BACKDROP.maxBytes,
          maxRedirects: 2,
        });
        const data = Buffer.from(picture.data);
        if (data.length > GALLERY_BACKDROP.maxBytes || imageKind(data) !== "webp") return null;
        backdropPath = await saveBackdrop(data, "webp");
      }

      void backendApi.post(`/themes/${id}/download`).catch(() => undefined);
      return { theme, backdropPath };
    },
  );

  handleSafe<PublishResult, [string, PublishPayload, PublishImages | null]>(
    "theme:publish",
    { ok: false, error: "failed" },
    [check.nonEmptyString(32768), check.object(8), check.optional(check.object(4))],
    async (_, token, payload, images) => {
      const form = new FormData();
      form.append("name", String(payload.name ?? "").slice(0, 40));
      form.append("mode", payload.mode === "light" ? "light" : "dark");
      form.append("colors", JSON.stringify(payload.colors ?? {}));

      if (payload.backdrop && images) {
        if (
          !isWebpBytes(images.backdrop, GALLERY_BACKDROP.maxBytes) ||
          !isWebpBytes(images.thumb, GALLERY_THUMB.maxBytes)
        ) {
          return { ok: false, error: "bad_picture" };
        }
        form.append("backdrop", JSON.stringify(payload.backdrop));
        form.append(
          "backdrop",
          new Blob([Buffer.from(images.backdrop)], { type: "image/webp" }),
          "backdrop.webp",
        );
        form.append(
          "thumb",
          new Blob([Buffer.from(images.thumb)], { type: "image/webp" }),
          "thumb.webp",
        );
      }

      try {
        const response = await backendApi.post("/themes", form, {
          ...auth(token),
          timeout: 120000,
        });
        const theme = normalizePublishedTheme(response.data);
        return theme ? { ok: true, theme } : { ok: false, error: "failed" };
      } catch (error) {
        return publishFailure(error);
      }
    },
  );

  handleSafe<PublishedTheme[] | null, [string]>(
    "theme:mine",
    null,
    [check.nonEmptyString(32768)],
    async (_, token) => {
      const response = await backendApi.get<{ items?: unknown }>("/themes/mine", auth(token));
      return (Array.isArray(response.data.items) ? response.data.items : [])
        .map(normalizePublishedTheme)
        .filter((item): item is PublishedTheme => item !== null);
    },
  );

  handleSafe<boolean, [string, string]>(
    "theme:unpublish",
    false,
    [check.nonEmptyString(32768), check.pattern(GALLERY_ID, 24)],
    async (_, token, id) => {
      await backendApi.delete(`/themes/${id}`, auth(token));
      return true;
    },
  );

  handleSafe<ImportResult, [string?]>("theme:import", null, async (event, sourcePath) => {
    let file = typeof sourcePath === "string" && sourcePath ? sourcePath : null;

    if (!file) {
      const window = BrowserWindow.fromWebContents(event.sender);
      const options: Electron.OpenDialogOptions = {
        properties: ["openFile"],
        filters: [{ name: "Grubie theme", extensions: [THEME_FILE_EXTENSION] }],
      };
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || !result.filePaths[0]) return null;
      file = result.filePaths[0];
    } else {
      assertReadablePath(file, "theme:import");
    }

    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > MAX_ARCHIVE_BYTES) return null;

    const zip = new AdmZip(file);
    const manifestEntry = zip.getEntry("theme.json");
    if (!manifestEntry || manifestEntry.header.size > MAX_MANIFEST_BYTES) return null;

    const manifest: unknown = JSON.parse(manifestEntry.getData().toString("utf-8"));
    if (!isManifest(manifest)) return null;

    let backdropPath: string | null = null;
    const entryName = manifest.backdrop?.file;
    if (typeof entryName === "string" && BACKDROP_ENTRY.test(entryName)) {
      const entry = zip.getEntry(entryName);
      if (entry && entry.header.size <= MAX_IMAGE_BYTES) {
        const data = entry.getData();
        const kind = data.length <= MAX_IMAGE_BYTES ? imageKind(data) : null;
        if (kind) backdropPath = await saveBackdrop(data, kind);
      }
    }

    return { manifest, backdropPath };
  });
}
