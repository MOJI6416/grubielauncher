import { app, BrowserWindow, clipboard, dialog, nativeImage, net, shell } from "electron";
import fs from "fs-extra";
import path from "path";
import { check, handleSafe } from "../utilities/ipc";
import { isSafeRemoteFetchUrl } from "../utilities/safeUrl";

const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const MAX_URL_LENGTH = 4096;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 30_000;

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/bmp": "bmp",
};

export type SaveImageResult = "saved" | "cancelled" | "failed";

interface FetchedImage {
  bytes: Buffer;
  type: string;
}

let lastSavedPath: string | null = null;

async function fetchRemoteImage(url: string): Promise<FetchedImage | null> {
  let target = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await isSafeRemoteFetchUrl(target))) return null;

    const response = await net.fetch(target, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      target = new URL(location, target).toString();
      continue;
    }

    if (!response.ok) return null;

    const type = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!type.startsWith("image/")) return null;

    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;

    return { bytes, type };
  }

  return null;
}

function safeFileStem(name: string): string {
  const stem = Array.from(name.replace(/\.[a-z0-9]{2,5}$/i, ""))
    .filter((char) => char.charCodeAt(0) >= 32)
    .join("")
    .replace(/[<>:"/\\|?*]+/g, "_")
    .trim()
    .slice(0, 80);
  return stem || "image";
}

function extensionOf(type: string, url: string): string {
  const known = EXTENSION_BY_TYPE[type];
  if (known) return known;
  const match = /\.([a-z0-9]{2,5})(?:$|[?#])/i.exec(new URL(url).pathname);
  return match ? match[1].toLowerCase() : "png";
}

export function registerMediaIpc() {
  handleSafe<{ bytes: Uint8Array; type: string } | null, [string]>(
    "media:fetchImage",
    null,
    [check.nonEmptyString(MAX_URL_LENGTH)],
    async (_, url) => {
      const image = await fetchRemoteImage(url);
      return image ? { bytes: new Uint8Array(image.bytes), type: image.type } : null;
    },
  );

  handleSafe<SaveImageResult, [string, string]>(
    "media:saveImage",
    "failed",
    [check.nonEmptyString(MAX_URL_LENGTH), check.string(256)],
    async (event, url, name) => {
      const image = await fetchRemoteImage(url);
      if (!image) return "failed";

      const extension = extensionOf(image.type, url);
      const window = BrowserWindow.fromWebContents(event.sender);
      const options: Electron.SaveDialogOptions = {
        defaultPath: path.join(
          app.getPath("downloads"),
          `${safeFileStem(name)}.${extension}`,
        ),
        filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
      };
      const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return "cancelled";

      await fs.writeFile(result.filePath, image.bytes);
      lastSavedPath = result.filePath;
      return "saved";
    },
  );

  handleSafe<void>("media:showSaved", undefined, [], async () => {
    if (lastSavedPath && (await fs.pathExists(lastSavedPath))) {
      shell.showItemInFolder(lastSavedPath);
    }
  });

  handleSafe<boolean, [Uint8Array]>(
    "clipboard:writeImageData",
    false,
    [(value) => value instanceof Uint8Array && value.byteLength <= MAX_IMAGE_BYTES],
    async (_, bytes) => {
      const image = nativeImage.createFromBuffer(Buffer.from(bytes));
      if (image.isEmpty()) return false;
      clipboard.writeImage(image);
      return true;
    },
  );
}
