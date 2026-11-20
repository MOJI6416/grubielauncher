import https from "node:https";
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(new URL("../package.json", import.meta.url));
const { Server } = require("socket.io");

const certDir = process.env.PERF_CERT_DIR;
const logFile = process.env.PERF_API_LOG;
const port = Number(process.env.PERF_API_PORT || 443);

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function makePng(size, seed) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = (x * 7 + seed * 31) & 255;
      raw[o + 1] = (y * 5 + seed * 17) & 255;
      raw[o + 2] = ((x ^ y) * 3 + seed) & 255;
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const images = new Map();
function image(size, seed) {
  const key = `${size}:${seed % 16}`;
  if (!images.has(key)) images.set(key, makePng(size, seed % 16));
  return images.get(key);
}

function hash(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

const now = Date.now();
const nicknames = [
  "Nightshade", "Pixelwolf", "Ember_Fox", "QuietCreeper", "Obsidia", "Kestrel",
  "Moonbrew", "RedstoneRay", "Tidecaller", "Wanderleaf", "Glimmer", "Ashborn",
  "FrostByte", "Mossy", "Copperhead", "Starling", "Duskwalker", "Brambleberry",
  "Zephyrine", "IronOak", "Lanternfish", "Cobalt", "Willowisp", "Sunpetal",
];
const friends = nicknames.map((nickname, index) => ({
  user: {
    _id: `66a0${String(index).padStart(20, "0")}`,
    uuid: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    nickname,
    platform: ["microsoft", "elyby", "discord"][index % 3],
    friends: [],
    image: null,
    headUrl: `https://cdn.grubielauncher.com/heads/${nickname}.png`,
    lastActive: new Date(now - index * 3600_000).toISOString(),
    createdAt: new Date(now - 300 * 86400_000).toISOString(),
    playTime: 3600 * (index + 3),
    achievements: [],
  },
  isOnline: index % 3 === 0,
  versionName: index % 3 === 0 ? ["Prominence II", "Create+", "COBBLEVERSE"][index % 3 === 0 ? (index / 3) % 3 : 0] : "",
  versionCode: "",
  serverAddress: "",
}));

const chats = friends.slice(0, 10).map((friend, index) => ({
  peerId: friend.user._id,
  unread: index < 3 ? index + 1 : 0,
  lastSeq: 40 + index,
  lastReadSeq: 40 + index - (index < 3 ? index + 1 : 0),
  peerReadSeq: 40 + index,
  peerReadAt: new Date(now - index * 600_000).toISOString(),
  lastMessage: {
    _id: `m${index}`,
    seq: 40 + index,
    senderId: friend.user._id,
    content: ["see you tonight", "the base is done!", "join my world", "gg"][index % 4],
    createdAt: new Date(now - index * 600_000).toISOString(),
  },
}));

const log = [];
function record(entry) {
  log.push(entry);
  if (logFile) fs.appendFileSync(logFile, JSON.stringify(entry) + "\n");
}

const fixtures = [];
function fixture(method, pattern, handler) {
  fixtures.push({ method, pattern, handler });
}

const day = 86400_000;
const iso = (offset) => new Date(now - offset).toISOString();

function versionManifest() {
  const versions = [];
  let t = now;
  const push = (id, type) => {
    t -= 3 * day;
    versions.push({
      id,
      type,
      url: `https://piston-meta.mojang.com/v1/packages/${hash(id).toString(16).padStart(40, "0")}/${id}.json`,
      time: new Date(t).toISOString(),
      releaseTime: new Date(t).toISOString(),
      sha1: hash(id).toString(16).padStart(40, "0"),
      complianceLevel: 1,
    });
  };
  for (const minor of [3, 2, 1]) {
    for (let w = 6; w >= 1; w--) push(`26.${minor}-snapshot-${w}`, "snapshot");
    push(`26.${minor}`, "release");
  }
  for (let minor = 21; minor >= 0; minor--) {
    const patches = minor >= 16 ? 6 : minor >= 7 ? 3 : 1;
    for (let patch = patches; patch >= 0; patch--) {
      if (minor >= 13) for (let w = 4; w >= 1; w--) push(`${17 + Math.floor(minor / 3)}w${String(10 + patch * 4 + w).padStart(2, "0")}a`, "snapshot");
      push(patch ? `1.${minor}.${patch}` : `1.${minor}`, "release");
    }
  }
  for (let b = 80; b >= 0; b--) push(`b1.${Math.floor(b / 10)}.${b % 10}`, "old_beta");
  for (let a = 60; a >= 0; a--) push(`a1.${Math.floor(a / 20)}.${a % 20}`, "old_alpha");
  return { latest: { release: "26.3", snapshot: "26.3" }, versions };
}
const manifest = versionManifest();

function fabricLoaders(mc) {
  return Array.from({ length: 140 }, (_, index) => {
    const version = `0.${16 - Math.floor(index / 20)}.${20 - (index % 20)}`;
    return {
      loader: { separator: ".", build: 300 - index, maven: `net.fabricmc:fabric-loader:${version}`, version, stable: index % 7 !== 0 },
      intermediary: { maven: `net.fabricmc:intermediary:${mc}`, version: mc, stable: true },
      launcherMeta: { version: 2, min_java_version: 8, libraries: { client: [], common: [], server: [] }, mainClass: { client: "net.fabricmc.loader.impl.launch.knot.KnotClient", server: "net.fabricmc.loader.impl.launch.knot.KnotServer" } },
    };
  });
}

function modrinthProject(id) {
  const seed = hash(id);
  return {
    id,
    slug: `project-${id.toLowerCase()}`,
    project_type: "mod",
    team: `team${id}`,
    title: `Project ${id}`,
    description: "A carefully tuned mod that improves performance and adds quality of life features.",
    body: "",
    categories: ["optimization", "utility"],
    additional_categories: [],
    client_side: "required",
    server_side: "optional",
    downloads: 1000 + (seed % 9_000_000),
    followers: seed % 50_000,
    icon_url: `https://cdn.modrinth.com/data/${id}/icon.png`,
    color: seed % 0xffffff,
    published: iso(400 * day),
    updated: iso((seed % 60) * day),
    versions: [`v${id}1`, `v${id}2`],
    game_versions: ["1.20.1", "1.21.1"],
    loaders: ["fabric", "neoforge"],
    gallery: [],
    license: { id: "MIT", name: "MIT License", url: null },
  };
}

const ownUser = {
  _id: "6612f0c4a9b3e1d2c3b4a5f6",
  uuid: "3f6c1a2e-8b4d-4e9a-9c1f-5d7e2b8a4c61",
  friendCode: "LUMA-7Q2K",
  friendRequestsEnabled: true,
  nickname: "Lumavia",
  platform: "discord",
  friends: [],
  image: null,
  headUrl: "https://api.grubielauncher.com/skins/head/discord/3f6c1a2e-8b4d-4e9a-9c1f-5d7e2b8a4c61",
  lastActive: iso(0),
  createdAt: iso(420 * day),
  playTime: 512_000,
  achievements: ["first_launch", "first_mod", "first_world", "night_owl", "social_butterfly", "modpack_author"],
  achievementPoints: 340,
  publicLeaderboard: true,
  publicProfile: true,
  isDonor: false,
};

const newsItems = Array.from({ length: 20 }, (_, index) => ({
  id: `news-${index}`,
  title: ["Minecraft 26.3 is out", "The Garden Awakens drop", "Modded spotlight: Create 6", "Snapshot 26.4-1", "Vibrant Visuals update"][index % 5] + (index > 4 ? ` #${index}` : ""),
  url: `https://www.minecraft.net/en-us/article/news-${index}`,
  author: "Mojang",
  image: `https://cdn.grubielauncher.com/news/cover-${index}.jpg`,
  imageAltText: "",
  description: "A new update brings biomes, mobs and a long list of fixes. Read the full changelog for details.",
  time: now - index * 2 * day,
  tags: ["minecraft", index % 2 ? "java" : "snapshot"],
}));

const releaseItems = Array.from({ length: 10 }, (_, index) => ({
  version: `2.2.${9 - index}`,
  title: `Grubie Launcher 2.2.${9 - index}`,
  subtitle: "Mod sets, instance port and a faster catalog",
  highlights: ["Mod sets", "Port an instance to another version", "Mod groups", "Author search in the catalog"],
  fixes: ["Fixed a crash when importing a Prism instance", "Faster startup on slow disks"],
  discordCta: "Discuss on Discord",
  discordUrl: "https://discord.gg/grubie",
  isMilestone: index === 0,
  cover: null,
  publishedAt: iso(index * 9 * day),
}));

fixture("GET", "/health", () => ({ body: { status: "ok" } }));
fixture("GET", "/mc/game/version_manifest_v2.json", () => ({ body: manifest }));
fixture("GET", /\/v2\/versions\/loader\/([^/]+)$/, ({ match }) => ({ body: fabricLoaders(decodeURIComponent(match[1])) }));
fixture("GET", "api.modrinth.com/v2/projects", ({ url }) => ({ body: JSON.parse(url.searchParams.get("ids") || "[]").map(modrinthProject) }));
fixture("GET", /^api\.modrinth\.com\/v2\/project\/([^/]+)$/, ({ match }) => ({ body: modrinthProject(match[1]) }));
fixture("GET", "/curseforge/search", () => ({ body: { data: [], pagination: { index: 0, pageSize: 20, resultCount: 0, totalCount: 0 } } }));
fixture("GET", /^[^/]+\/users\/6612f0c4a9b3e1d2c3b4a5f6$/, () => ({ body: ownUser }));
fixture("GET", "/news", () => ({ body: { generatedAt: iso(0), items: newsItems, nextCursor: null } }));
fixture("GET", "/news.json", () => ({ body: newsItems }));
fixture("GET", "/launcher/releases", () => ({ body: { generatedAt: iso(0), total: releaseItems.length, offset: 0, items: releaseItems } }));
fixture("GET", "/ads/feed", () => ({ body: "null" }));
fixture("PATCH", /^[^/]+\/users\/6612f0c4a9b3e1d2c3b4a5f6$/, () => ({ body: ownUser }));
const leaderboard = Array.from({ length: 100 }, (_, index) => ({
  rank: index + 1,
  id: index === 41 ? ownUser._id : `66b0${String(index).padStart(20, "0")}`,
  nickname: index === 41 ? ownUser.nickname : `${nicknames[index % nicknames.length]}${index}`,
  image: null,
  headUrl: `https://cdn.grubielauncher.com/heads/lb-${index}.png`,
  points: 2000 - index * 17,
  level: Math.max(1, 12 - Math.floor(index / 9)),
  achievementsCount: Math.max(1, 50 - Math.floor(index / 2)),
  isDonor: index % 11 === 0,
}));
fixture("GET", "/leaderboard", () => ({ body: { generatedAt: iso(0), users: leaderboard } }));
fixture("GET", "/leaderboard/me", () => ({ body: { ...leaderboard[41], listed: true } }));
fixture("GET", "/leaderboard/achievements", () => ({
  body: {
    generatedAt: iso(0),
    totalUsers: 18_400,
    achievements: ownUser.achievements.map((id, index) => ({ id, points: 10 + index * 5, count: 9000 - index * 1300, percent: 49 - index * 7 })),
  },
}));
fixture("GET", "/modpacks/own", () => ({ body: [] }));
fixture("GET", "/share/me/remote-stats", () => ({ body: [] }));
fixture("GET", "/groups", () => ({ body: [] }));
fixture("GET", "/share/friends/active", () => ({ body: [] }));

const coverWebp = (version) => fs.readFileSync(new URL(`../release-notes/covers/${version}.webp`, import.meta.url));
const galleryTheme = (n, name, mode, colors, cover, author, downloads, age) => ({
  id: `64f0000000000000000000${String(n).padStart(2, "0")}`,
  name,
  mode,
  colors,
  backdrop: cover
    ? {
        dim: 50,
        blur: 4,
        panelOpacity: 86,
        url: `https://cdn.grubielauncher.com/theme-media/${cover}.webp`,
        thumbUrl: `https://cdn.grubielauncher.com/theme-media/${cover}.webp`,
      }
    : null,
  authorName: author,
  downloads,
  createdAt: iso(age * day),
});
const galleryThemes = [
  galleryTheme(1, "Лесная тропа", "dark", { background: "#0d120c", surface: "#182016", foreground: "#eef3ea", accent: "#9bd35a" }, "2.2.2", "Alex", 1290, 14),
  galleryTheme(2, "Мятная ночь", "dark", { background: "#0b1412", surface: "#13201d", foreground: "#e8f5f1", accent: "#3ddc97" }, null, "Mint", 412, 9),
  galleryTheme(3, "Бумага", "light", { background: "#f1ece3", surface: "#fffaf2", foreground: "#1d1a16", accent: "#c2410c" }, null, "Lumavia", 167, 6),
  galleryTheme(4, "Северное сияние", "dark", { background: "#07101a", surface: "#0f1c2b", foreground: "#e6f1fb", accent: "#38bdf8" }, "2.2.1", "Aurora", 88, 2),
  galleryTheme(5, "Закат над рекой", "dark", { background: "#140d12", surface: "#22161e", foreground: "#f6eef2", accent: "#ff7a45" }, "2.2.4", "Steve_Builder", 41, 1),
  galleryTheme(6, "Неоновый город", "dark", { background: "#090b14", surface: "#121626", foreground: "#eef1ff", accent: null }, "2.2.0", "pixelfox", 23, 0.5),
];
const myThemes = [];
let lastThemePublish = null;
fixture("GET", /^[^/]+\/themes$/, ({ url }) => {
  const mode = url.searchParams.get("mode");
  const search = (url.searchParams.get("search") || "").toLowerCase();
  let items = galleryThemes.filter((theme) => !mode || theme.mode === mode);
  if (search) items = items.filter((theme) => `${theme.name} ${theme.authorName}`.toLowerCase().includes(search));
  if (url.searchParams.get("sort") === "downloads") items = [...items].sort((a, b) => b.downloads - a.downloads);
  return { body: { items, total: items.length, page: 1, pageSize: 24 } };
});
fixture("GET", /^[^/]+\/themes\/mine$/, () => ({ body: { items: myThemes } }));
fixture("GET", /^[^/]+\/themes\/([0-9a-f]{24})$/, ({ match }) => {
  const theme = galleryThemes.find((item) => item.id === match[1]);
  return theme ? { body: theme } : { status: 404, body: { message: "Not Found" } };
});
fixture("POST", /^[^/]+\/themes\/([0-9a-f]{24})\/download$/, ({ match }) => {
  const theme = galleryThemes.find((item) => item.id === match[1]);
  if (theme) theme.downloads += 1;
  return { status: 201, body: { downloads: theme?.downloads ?? 0 } };
});
fixture("POST", /^[^/]+\/themes$/, ({ body, req }) => {
  const field = (name) => body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`))?.[1] ?? null;
  lastThemePublish = {
    auth: Boolean(req.headers.authorization),
    name: field("name"),
    mode: field("mode"),
    colors: field("colors"),
    backdrop: body.match(/name="backdrop"\r\n\r\n(\{[^\r]*)/)?.[1] ?? null,
    backdropFile: body.includes('filename="backdrop.webp"'),
    thumbFile: body.includes('filename="thumb.webp"'),
    bytes: body.length,
  };
  const theme = {
    ...galleryTheme(90 + myThemes.length, lastThemePublish.name || "", lastThemePublish.mode || "dark", JSON.parse(lastThemePublish.colors || "{}"), null, "Lumavia", 0, 0),
    status: "pending",
    rejectionReason: null,
  };
  myThemes.unshift(theme);
  return { status: 201, body: theme };
});
fixture("DELETE", /^[^/]+\/themes\/([0-9a-f]{24})$/, ({ match }) => {
  const index = myThemes.findIndex((item) => item.id === match[1]);
  if (index >= 0) myThemes.splice(index, 1);
  return { body: { ok: true } };
});
fixture("GET", /^[^/]+\/theme-media\/([\d.]+)\.webp$/, ({ match }) => ({ body: coverWebp(match[1]), type: "image/webp" }));
fixture("GET", "/__perf/themes/last-publish", () => ({ body: lastThemePublish ?? {} }));

const syncState = { settings: { values: {}, stamps: {} }, themes: new Map(), wardrobe: new Map() };
const syncId = () => crypto.randomBytes(12).toString("hex");
const sha = (algorithm, data) => crypto.createHash(algorithm).update(data).digest("hex");

function multipart(raw, contentType) {
  const boundary = /boundary=([^;]+)/.exec(contentType || "")?.[1];
  const fields = {};
  const files = {};
  if (!boundary) return { fields, files };
  const marker = Buffer.from(`--${boundary}`);
  let start = raw.indexOf(marker);
  while (start !== -1) {
    const next = raw.indexOf(marker, start + marker.length);
    if (next === -1) break;
    const part = raw.subarray(start + marker.length + 2, next - 2);
    const split = part.indexOf("\r\n\r\n");
    const head = part.subarray(0, split).toString("utf8");
    const content = part.subarray(split + 4);
    const name = /name="([^"]+)"/.exec(head)?.[1];
    if (name && /filename="/.test(head)) files[name] = Buffer.from(content);
    else if (name) fields[name] = content.toString("utf8");
    start = next;
  }
  return { fields, files };
}

function syncTheme(theme) {
  const { picture: _picture, ...rest } = theme;
  return rest;
}

function privateThemeFrom(fields, files, current) {
  const backdrop = fields.backdrop ? JSON.parse(fields.backdrop) : null;
  let picture = null;
  if (backdrop) {
    if (files.backdrop) picture = files.backdrop;
    else if (fields.keepPicture === "1" && current?.picture) picture = current.picture;
    else return { error: { status: 400, body: { code: "picture_required" } } };
  }
  const pictureHash = picture ? sha("sha256", picture) : null;
  const theme = {
    name: fields.name,
    mode: fields.mode === "light" ? "light" : "dark",
    colors: JSON.parse(fields.colors || "{}"),
    backdrop: backdrop ? { ...backdrop, hash: pictureHash } : null,
    clientId: fields.clientId || null,
    changedAt: Math.min(Number(fields.changedAt) || 1, Date.now()),
    picture,
  };
  theme.hash = sha("sha256", JSON.stringify([theme.name, theme.mode, theme.colors, backdrop, pictureHash]));
  return { theme };
}

fixture("GET", "/sync/settings", () => ({ body: syncState.settings }));
fixture("PUT", "/sync/settings", ({ body }) => {
  const incoming = JSON.parse(body || "{}");
  const merged = syncState.settings;
  for (const [key, value] of Object.entries(incoming.values || {})) {
    const stamp = Math.min(Number(incoming.stamps?.[key]) || 0, Date.now());
    if (!(stamp > 0) || (merged.stamps[key] !== undefined && stamp <= merged.stamps[key])) continue;
    merged.values[key] = value;
    merged.stamps[key] = stamp;
  }
  return { body: merged };
});
fixture("GET", "/sync/themes", () => ({ body: { items: [...syncState.themes.values()].map(syncTheme) } }));
fixture("POST", "/sync/themes", ({ raw, req }) => {
  const { fields, files } = multipart(raw, req.headers["content-type"]);
  const { theme, error } = privateThemeFrom(fields, files, null);
  if (error) return error;
  const duplicate = [...syncState.themes.values()].find((item) => item.hash === theme.hash);
  if (duplicate) return { status: 409, body: { code: "duplicate", id: duplicate.id } };
  theme.id = syncId();
  syncState.themes.set(theme.id, theme);
  return { status: 201, body: syncTheme(theme) };
});
fixture("PUT", /^[^/]+\/sync\/themes\/([0-9a-f]{24})$/, ({ raw, req, match }) => {
  const current = syncState.themes.get(match[1]);
  if (!current) return { status: 404, body: { message: "Not Found" } };
  const { fields, files } = multipart(raw, req.headers["content-type"]);
  const { theme, error } = privateThemeFrom(fields, files, current);
  if (error) return error;
  if (theme.changedAt <= current.changedAt) return { body: syncTheme(current) };
  const duplicate = [...syncState.themes.values()].find((item) => item.hash === theme.hash && item.id !== current.id);
  if (duplicate) return { status: 409, body: { code: "duplicate", id: duplicate.id } };
  Object.assign(current, theme, { id: current.id, clientId: theme.clientId ?? current.clientId });
  return { body: syncTheme(current) };
});
fixture("DELETE", /^[^/]+\/sync\/themes\/([0-9a-f]{24})$/, ({ match }) => {
  if (!syncState.themes.delete(match[1])) return { status: 404, body: { message: "Not Found" } };
  return { body: { ok: true } };
});
fixture("GET", /^[^/]+\/sync\/themes\/([0-9a-f]{24})\/backdrop$/, ({ match }) => {
  const picture = syncState.themes.get(match[1])?.picture;
  return picture ? { body: picture, type: "image/webp" } : { status: 404, body: { message: "Not Found" } };
});
const wardrobeKey = (kind, hash) => `${kind}:${hash}`;
const wardrobeItem = ({ data: _data, ...item }) => item;
fixture("GET", "/sync/wardrobe", () => ({ body: { items: [...syncState.wardrobe.values()].map(wardrobeItem) } }));
fixture("PUT", /^[^/]+\/sync\/wardrobe\/(skin|cape)\/([a-f0-9]{40})$/, ({ body, match }) => {
  const [, kind, hash] = match;
  const dto = JSON.parse(body || "{}");
  const changedAt = Math.min(Number(dto.changedAt) || 1, Date.now());
  const current = syncState.wardrobe.get(wardrobeKey(kind, hash));
  if (current && changedAt <= current.changedAt) return { body: wardrobeItem(current) };
  if (!current && !dto.data) return { status: 400, body: { code: "data_required" } };
  const data = current?.data ?? Buffer.from(dto.data, "base64");
  if (sha("sha1", data) !== hash) return { status: 400, body: { code: "hash_mismatch" } };
  const item = {
    kind,
    hash,
    name: dto.name || hash.slice(0, 12),
    model: kind === "skin" ? (dto.model === "slim" ? "slim" : "classic") : null,
    cape: kind === "skin" ? dto.cape || null : null,
    changedAt,
    data,
  };
  syncState.wardrobe.set(wardrobeKey(kind, hash), item);
  return { body: wardrobeItem(item) };
});
fixture("GET", /^[^/]+\/sync\/wardrobe\/(skin|cape)\/([a-f0-9]{40})\/texture$/, ({ match }) => {
  const item = syncState.wardrobe.get(wardrobeKey(match[1], match[2]));
  return item ? { body: item.data, type: "image/png" } : { status: 404, body: { message: "Not Found" } };
});
fixture("DELETE", /^[^/]+\/sync\/wardrobe\/(skin|cape)\/([a-f0-9]{40})$/, ({ match }) => {
  const removed = syncState.wardrobe.delete(wardrobeKey(match[1], match[2]));
  return { body: { ok: true, removed } };
});
fixture("GET", "/__perf/sync/state", () => ({
  body: {
    settings: syncState.settings,
    themes: [...syncState.themes.values()].map((theme) => ({ ...syncTheme(theme), pictureBytes: theme.picture?.length ?? 0 })),
    wardrobe: [...syncState.wardrobe.values()].map(wardrobeItem),
  },
}));

function send(res, status, body, type = "application/json") {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": type,
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "*",
    "cache-control": type.startsWith("image/") ? "public, max-age=86400" : "no-store",
  });
  res.end(payload);
}

const server = https.createServer(
  {
    key: fs.readFileSync(path.join(certDir, "key.pem")),
    cert: fs.readFileSync(path.join(certDir, "cert.pem")),
  },
  (req, res) => {
    if (req.url.startsWith("/socket.io/")) return;
    const url = new URL(req.url, `https://${req.headers.host}`);
    const host = req.headers.host || "";
    if (req.method === "OPTIONS") return send(res, 204, "");

    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const ext = path.extname(url.pathname).toLowerCase();
      const accept = String(req.headers.accept || "");
      const isImage =
        [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext) ||
        (accept.startsWith("image/") && !accept.includes("json"));
      for (const { method, pattern, handler } of fixtures) {
        if (method !== "*" && method !== req.method) continue;
        const target = `${host}${url.pathname}`;
        const match = typeof pattern === "string" ? target === pattern || url.pathname === pattern : target.match(pattern);
        if (!match) continue;
        const raw = Buffer.concat(chunks);
        const result = handler({ url, host, req, body: raw.toString("utf8"), raw, match });
        record({ t: Date.now(), m: req.method, host, path: url.pathname, q: url.search, s: result.status ?? 200, fx: true });
        if (result.png) return send(res, 200, image(result.png, hash(url.pathname)), "image/png");
        return send(res, result.status ?? 200, result.body ?? {}, result.type);
      }
      if (isImage) {
        record({ t: Date.now(), m: req.method, host, path: url.pathname, s: 200, img: true });
        return send(res, 200, image(url.pathname.includes("/news/") ? 512 : 64, hash(url.pathname)), "image/png");
      }
      record({ t: Date.now(), m: req.method, host, path: url.pathname, q: url.search, s: 404 });
      send(res, 404, { message: "not found", statusCode: 404 });
    });
  },
);

const io = new Server(server, { cors: { origin: "*" } });
io.of("/friends").on("connection", (socket) => {
  record({ t: Date.now(), ws: "/friends", ev: "connection" });
  socket.onAny((event) => record({ t: Date.now(), ws: "/friends", ev: event }));
  socket.on("getFriends", () => {
    socket.emit("friends", { friends });
    socket.emit("friendRequests", { requests: [] });
  });
  socket.on("getChatsSummary", () => socket.emit("chatsSummary", { chats }));
  socket.on("getMessages", (payload) => {
    const friendId = payload?.friendId;
    const lines = ["hey, are you online?", "yes, joining in 5", "bring some iron 😄", "the nether portal is ready", "ok see you there", "gg that was close 🔥", "let's build a farm tomorrow", "sure!"];
    const messages = Array.from({ length: Math.min(Number(payload?.limit) || 50, 50) }, (_, index) => ({
      id: `${friendId}-msg-${index}`,
      seq: index + 1,
      sender: index % 3 === 0 ? "6612f0c4a9b3e1d2c3b4a5f6" : friendId,
      message: { _type: "text", value: lines[index % lines.length] },
      time: new Date(now - (50 - index) * 300_000).toISOString(),
    }));
    socket.emit("getMessages", { friendId, messages });
  });
  socket.on("getGroupInvites", () => socket.emit("groupInvites", { invites: [] }));
});
io.of(/.*/).on("connection", (socket) => {
  record({ t: Date.now(), ws: socket.nsp.name, ev: "connection" });
  socket.onAny((event) => record({ t: Date.now(), ws: socket.nsp.name, ev: event }));
});

const proxyPort = Number(process.env.PERF_PROXY_PORT || 8079);
const proxy = http.createServer((req, res) => {
  const target = new URL(req.url);
  record({ t: Date.now(), m: req.method, host: target.host, path: target.pathname, proxyPlain: true, s: 404 });
  res.writeHead(404, { "content-type": "application/json" });
  res.end("{}");
});
proxy.on("connect", (req, clientSocket, head) => {
  const upstream = net.connect(port, "127.0.0.1", () => {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head?.length) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  upstream.on("error", () => clientSocket.destroy());
  clientSocket.on("error", () => upstream.destroy());
});

server.listen(port, "127.0.0.1", () => {
  proxy.listen(proxyPort, "127.0.0.1", () => {
    console.log(`fake api on 127.0.0.1:${port}, proxy ${proxyPort}`);
  });
});
