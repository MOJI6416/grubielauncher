import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NOTES_DIR = path.join(ROOT, "release-notes");
const COVERS_DIR = path.join(NOTES_DIR, "covers");
const COVER_MAX_BYTES = 2 * 1024 * 1024;
const COVER_FILES = { webp: "webp", jpeg: "jpg" };
const REPO = process.env.GITHUB_REPOSITORY || "MOJI6416/grubielauncher";
const API_URL = (process.env.GRUBIE_API_URL || "https://api.grubielauncher.com").replace(/\/+$/, "");

const GUILD_ID = "1229487451916210236";
const BUG_REPORTS_CHANNEL = "1463718142533566588";
const LOCALES = ["en", "ru", "uk", "de", "es", "fr", "pl", "pt", "tr"];
const REQUIRED_LOCALES = ["en", "ru", "uk"];
const DISCORD_LIMIT = 2000;

const DISCORD = {
  en: {
    available: (version) => `**Grubie Launcher ${version} is now available.**`,
    highlights: "What's new:",
    fixes: "Fixed:",
    report: `*If you notice an issue after updating, please report it in <#${BUG_REPORTS_CHANNEL}>.*`,
    role: "1417290800710160534"
  },
  ru: {
    available: (version) => `**Grubie Launcher ${version} доступен.**`,
    highlights: "Что нового:",
    fixes: "Исправлено:",
    report: `*Если заметите проблему после обновления — пишите в <#${BUG_REPORTS_CHANNEL}>.*`,
    role: "1417283423340331242"
  },
  uk: {
    available: (version) => `**Grubie Launcher ${version} доступний.**`,
    highlights: "Що нового:",
    fixes: "Виправлено:",
    report: `*Якщо помітите проблему після оновлення — пишіть у <#${BUG_REPORTS_CHANNEL}>.*`,
    role: "1417283822101467216"
  },
  de: {
    available: (version) => `**Grubie Launcher ${version} ist verfügbar.**`,
    highlights: "Neu:",
    fixes: "Behoben:",
    report: `*Wenn Ihnen nach dem Update ein Problem auffällt, melden Sie es bitte in <#${BUG_REPORTS_CHANNEL}>.*`,
    role: "1561151650222309396"
  },
  es: {
    available: (version) => `**Grubie Launcher ${version} ya está disponible.**`,
    highlights: "Novedades:",
    fixes: "Corregido:",
    report: `*Si nota algún problema después de actualizar, avísenos en <#${BUG_REPORTS_CHANNEL}>.*`,
    role: "1561151710557372457"
  },
  fr: {
    available: (version) => `**Grubie Launcher ${version} est disponible.**`,
    highlights: "Nouveautés :",
    fixes: "Corrigé :",
    report: `*Si vous remarquez un problème après la mise à jour, signalez-le dans <#${BUG_REPORTS_CHANNEL}>.*`,
    role: "1561151743553703986"
  },
  pl: {
    available: (version) => `**Grubie Launcher ${version} jest już dostępny.**`,
    highlights: "Co nowego:",
    fixes: "Naprawiono:",
    report: `*Problemy po aktualizacji prosimy zgłaszać na <#${BUG_REPORTS_CHANNEL}>.*`,
    role: "1561151852350021713"
  },
  pt: {
    available: (version) => `**Grubie Launcher ${version} já está disponível.**`,
    highlights: "Novidades:",
    fixes: "Corrigido:",
    report: `*Se notar algum problema depois de atualizar, avise em <#${BUG_REPORTS_CHANNEL}>.*`,
    role: "1561151854442848277"
  },
  tr: {
    available: (version) => `**Grubie Launcher ${version} yayında.**`,
    highlights: "Yenilikler:",
    fixes: "Düzeltildi:",
    report: `*Güncellemeden sonra bir sorun fark ederseniz lütfen <#${BUG_REPORTS_CHANNEL}> kanalına bildirin.*`,
    role: "1561151855600607272"
  }
};

const WHATS_NEW = {
  en: { title: "Title", subtitle: "Subtitle", highlights: "Highlights", fixes: "Fixed" },
  ru: { title: "Заголовок", subtitle: "Подзаголовок", highlights: "Главное", fixes: "Исправлено" },
  uk: { title: "Заголовок", subtitle: "Підзаголовок", highlights: "Головне", fixes: "Виправлено" },
  de: { title: "Titel", subtitle: "Untertitel", highlights: "Das Wichtigste", fixes: "Behoben" },
  es: { title: "Título", subtitle: "Subtítulo", highlights: "Lo principal", fixes: "Corregido" },
  fr: { title: "Titre", subtitle: "Sous-titre", highlights: "L’essentiel", fixes: "Corrigé" },
  pl: { title: "Tytuł", subtitle: "Podtytuł", highlights: "Najważniejsze", fixes: "Naprawiono" },
  pt: { title: "Título", subtitle: "Subtítulo", highlights: "Destaques", fixes: "Corrigido" },
  tr: { title: "Başlık", subtitle: "Alt başlık", highlights: "Öne çıkanlar", fixes: "Düzeltildi" }
};

const FIX_PREFIX = {
  en: /^fix(ed|es)?\b/i,
  ru: /^исправлен[аоы]?(?![а-яё])/i,
  uk: /^виправлен[аоі]?(?![а-яґєії'])/i,
  de: /^(behoben|korrigiert)(?![a-zäöüß])/i,
  es: /^(corregid|arreglad)[oa]s?(?![a-záéíóúñü])/i,
  fr: /^corrigée?s?(?![a-zàâçéèêëîïôûùüÿœ])/i,
  pl: /^naprawion[oaey]?(?![a-ząćęłńóśźż])/i,
  pt: /^corrigid[oa]s?(?![a-záâãàçéêíóôõú])/i,
  tr: /^düzeltil(di|en|miş)(?![a-zçğıöşü])/i
};

const INFORMAL = {
  ru: /(^|[^а-яё])(ты|тебя|тебе|тобой|твой|твоя|твоё|твое|твои|твоих|твоим)(?![а-яё])/i,
  uk: /(^|[^а-яґєії'])(ти|тебе|тобі|тобою|твій|твоя|твоє|твої|твоїх|твоїм)(?![а-яґєії'])/i,
  de: /(^|[^a-zäöüß])(du|dich|dir|dein|deine|deinen|deinem|deiner|deines)(?![a-zäöüß])/i,
  es: /(^|[^a-záéíóúñü])(tú|tu|tus|te|ti|contigo)(?![a-záéíóúñü])/i,
  fr: /(^|[^a-zàâçéèêëîïôûùüÿœ])(tu|toi|ton|ta|tes)(?![a-zàâçéèêëîïôûùüÿœ])/i,
  tr: /(^|[^a-zçğıöşü])(sen|seni|sana|senin|sende)(?![a-zçğıöşü])/i
};

const INTERNAL = /(\.(tsx?|jsx?|mjs|cjs|json)\b|\bsrc\/|\bIPC\b|\brenderer\b|\b[a-z]+[A-Z][A-Za-z]*\(?)/;

class NotesError extends Error {}

const IN_ACTIONS = process.env.GITHUB_ACTIONS === "true";

const RELEASE_LINK =
  /^(?:home|news|screenshots|catalog|accounts|agent|instance-new|wardrobe(?:\/catalog)?|profile(?:\/(?:achievements|leaderboard|modpacks))?|people(?:\/(?:friends|groups|requests))?|instance\/[a-z]+|settings(?:\/[a-z-]+){0,2}|setting:[A-Za-z]+)$/;

function fail(message) {
  console.error(IN_ACTIONS ? `::error::${message.replace(/\n/g, "%0A")}` : `Error:\n${message}`);
  process.exit(1);
}

function packageVersion() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
}

function notesPath(version) {
  return path.join(NOTES_DIR, `${version}.json`);
}

function readNotes(version) {
  const file = notesPath(version);
  if (!fs.existsSync(file)) {
    throw new NotesError(`No release-notes/${version}.json: the grubie-release-writer skill writes release texts`);
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new NotesError(`release-notes/${version}.json is not JSON: ${error.message}`);
  }
}

function coverPath(version, format) {
  return path.join(COVERS_DIR, `${version}.${COVER_FILES[format]}`);
}

function coverErrors(version) {
  const present = Object.keys(COVER_FILES).filter((format) => fs.existsSync(coverPath(version, format)));
  if (!present.length) return null;
  const errors = [];
  for (const format of Object.keys(COVER_FILES)) {
    const name = `release-notes/covers/${version}.${COVER_FILES[format]}`;
    if (!present.includes(format)) {
      errors.push(`No ${name}: a cover is a .webp and .jpg pair`);
      continue;
    }
    const image = fs.readFileSync(coverPath(version, format));
    if (image.length > COVER_MAX_BYTES) errors.push(`${name}: larger than 2 MB`);
    const matches =
      format === "webp"
        ? image.toString("ascii", 0, 4) === "RIFF" && image.toString("ascii", 8, 12) === "WEBP"
        : image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
    if (!matches) errors.push(`${name}: not a ${format.toUpperCase()} file`);
  }
  const github = path.join(COVERS_DIR, `${version}.github.webp`);
  if (fs.existsSync(github)) {
    const image = fs.readFileSync(github);
    if (image.toString("ascii", 0, 4) !== "RIFF" || image.toString("ascii", 8, 12) !== "WEBP") {
      errors.push(`release-notes/covers/${version}.github.webp: not a WEBP file`);
    }
  }
  return errors;
}

function githubCover(version) {
  const file = path.join(COVERS_DIR, `${version}.github.webp`);
  if (!fs.existsSync(file)) return null;
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  return `https://raw.githubusercontent.com/${REPO}/${commit}/release-notes/covers/${version}.github.webp`;
}

function readCover(version) {
  const errors = coverErrors(version);
  if (errors === null) return null;
  if (errors.length) throw new NotesError(errors.map((error) => `- ${error}`).join("\n"));
  return Object.fromEntries(
    Object.keys(COVER_FILES).map((format) => [format, fs.readFileSync(coverPath(version, format)).toString("base64")])
  );
}

function stripPeriod(item) {
  return item.replace(/(?<!\.)\.$/, "");
}

function bulletList(items, separator) {
  return items
    .map((item, index) => `- ${separator ? stripPeriod(item) : item}${separator && index < items.length - 1 ? ";" : ""}`)
    .join("\n");
}

function notesLocales(notes) {
  return LOCALES.filter((locale) => REQUIRED_LOCALES.includes(locale) || notes[locale] !== undefined);
}

function threadLocales(notes) {
  return notesLocales(notes).filter((locale) => locale !== "en");
}

const DISCORD_MORE = {
  en: "More in the full release notes:",
  ru: "Остальное — в полном списке изменений:",
  uk: "Решта — у повному списку змін:",
  de: "Alles Weitere in den vollständigen Versionshinweisen:",
  es: "El resto, en las notas completas de la versión:",
  fr: "La suite dans les notes de version complètes :",
  pl: "Pozostałe zmiany w pełnej liście:",
  pt: "O restante está nas notas completas da versão:",
  tr: "Diğer değişiklikler tam sürüm notlarında:"
};

function releasePageUrl(notes, locale) {
  return `https://grubielauncher.com/${locale}/release/${notes.version}`;
}

function composeDiscord(notes, locale, highlights, fixes, more) {
  const template = DISCORD[locale];
  const parts = [template.available(notes.version)];
  if (highlights.length) parts.push(`${template.highlights}\n${bulletList(highlights, true)}`);
  if (fixes.length) parts.push(`${template.fixes}\n${bulletList(fixes, true)}`);
  if (more) parts.push(`${DISCORD_MORE[locale]} <${releasePageUrl(notes, locale)}>`);
  parts.push(template.role ? `${template.report}\n\n<@&${template.role}>` : template.report);
  return parts.join("\n\n");
}

function fitDiscord(notes, locale) {
  const content = notes[locale];
  let highlights = content.highlights;
  let fixes = content.fixes;
  let text = composeDiscord(notes, locale, highlights, fixes, false);
  if (text.length <= DISCORD_LIMIT) return { text, shown: highlights.length + fixes.length };

  while (true) {
    if (fixes.length) fixes = fixes.slice(0, -1);
    else if (highlights.length > 1) highlights = highlights.slice(0, -1);
    else break;
    text = composeDiscord(notes, locale, highlights, fixes, true);
    if (text.length <= DISCORD_LIMIT) break;
  }
  return { text, shown: highlights.length + fixes.length };
}

function renderDiscord(notes, locale) {
  return fitDiscord(notes, locale).text;
}

function renderGithub(notes, coverUrl) {
  const content = notes.en;
  const parts = [`## Grubie Launcher ${notes.version}`, content.subtitle];
  if (coverUrl) parts.unshift(`<img src="${coverUrl}" alt="Grubie Launcher ${notes.version}" width="480">`);
  if (content.highlights.length) parts.push(`### Highlights\n${bulletList(content.highlights, false)}`);
  if (content.fixes.length) parts.push(`### Fixed\n${bulletList(content.fixes, false)}`);
  return parts.join("\n\n");
}

function renderWhatsNew(notes, locale) {
  const labels = WHATS_NEW[locale];
  const content = notes[locale];
  const parts = [
    `**${labels.title}**\n${content.title || `Grubie Launcher ${notes.version}`}`,
    `**${labels.subtitle}**\n${content.subtitle}`
  ];
  if (content.highlights.length) parts.push(`**${labels.highlights}**\n${bulletList(content.highlights, false)}`);
  if (content.fixes.length) parts.push(`**${labels.fixes}**\n${bulletList(content.fixes, false)}`);
  return parts.join("\n\n");
}

function threadName(notes) {
  return `Grubie Launcher ${notes.version}`;
}

function validate(notes, version) {
  const errors = [];
  const warnings = [];

  if (!notes || typeof notes !== "object" || Array.isArray(notes)) {
    return { errors: ["The file must be a JSON object"], warnings };
  }

  const known = new Set(["version", "isMilestone", "links", ...LOCALES]);
  for (const key of Object.keys(notes)) {
    if (!known.has(key)) errors.push(`Unknown field "${key}"`);
  }
  if (notes.version !== version) errors.push(`version in the file (${notes.version}) does not match ${version}`);
  if (!/^\d+\.\d+\.\d+$/.test(String(notes.version))) errors.push(`Version "${notes.version}" is not X.Y.Z`);
  if (notes.isMilestone !== undefined && typeof notes.isMilestone !== "boolean") {
    errors.push("isMilestone must be true or false");
  }
  if (notes.links !== undefined) {
    if (!Array.isArray(notes.links)) {
      errors.push("links: must be an array with one link per highlight, null where there is none");
    } else {
      notes.links.forEach((link, index) => {
        if (link === null) return;
        if (typeof link !== "string" || !RELEASE_LINK.test(link)) {
          errors.push(`links[${index}]: "${link}" is not a place in the launcher (e.g. settings/privacy, setting:discordActivity, wardrobe/catalog)`);
        }
      });
    }
  }

  for (const locale of LOCALES) {
    const content = notes[locale];
    if (content === undefined && !REQUIRED_LOCALES.includes(locale)) continue;
    if (!content || typeof content !== "object" || Array.isArray(content)) {
      errors.push(`No "${locale}" block`);
      continue;
    }
    for (const key of Object.keys(content)) {
      if (!["title", "subtitle", "highlights", "fixes"].includes(key)) errors.push(`${locale}: unknown field "${key}"`);
    }
    if (content.title !== undefined && (typeof content.title !== "string" || !content.title.trim())) {
      errors.push(`${locale}.title: empty title; drop the field to get "Grubie Launcher ${version}"`);
    }
    if (typeof content.subtitle !== "string" || !content.subtitle.trim()) {
      errors.push(`${locale}.subtitle: needs a one-sentence subtitle`);
    } else {
      if (content.subtitle.length > 160) warnings.push(`${locale}.subtitle: longer than 160 characters`);
      if (!/[.!?]$/.test(content.subtitle)) warnings.push(`${locale}.subtitle: no period at the end`);
    }

    for (const field of ["highlights", "fixes"]) {
      const items = content[field];
      if (!Array.isArray(items)) {
        errors.push(`${locale}.${field}: must be an array (empty is [])`);
        continue;
      }
      if (items.length > 16) errors.push(`${locale}.${field}: more than 16 items, the api keeps at most 16`);
      items.forEach((item, index) => {
        const where = `${locale}.${field}[${index}]`;
        if (typeof item !== "string" || !item.trim()) {
          errors.push(`${where}: empty item`);
          return;
        }
        if (item !== item.trim() || /\n/.test(item)) errors.push(`${where}: spaces at the edges or a line break`);
        if (/^[-–—•*]/.test(item)) errors.push(`${where}: the template adds the bullet, remove "${item[0]}"`);
        if (!/[.!?]$/.test(item)) warnings.push(`${where}: no period at the end`);
        if (/^\p{Ll}/u.test(item)) warnings.push(`${where}: starts with a lowercase letter`);
        if (item.length > 220) warnings.push(`${where}: longer than 220 characters, shorten it`);
        if (field === "fixes" && FIX_PREFIX[locale].test(item)) {
          warnings.push(`${where}: under "${WHATS_NEW[locale].fixes}" do not start with "${item.split(" ")[0]}", describe what works now`);
        }
        if (INFORMAL[locale]?.test(item)) warnings.push(`${where}: informal address, the launcher always uses the formal one`);
        if (INTERNAL.test(item)) warnings.push(`${where}: looks like an internal name (${item.match(INTERNAL)[0]})`);
      });
    }
  }

  if (errors.length) return { errors, warnings };

  const locales = notesLocales(notes);
  if (Array.isArray(notes.links) && notes.links.length > notes.en.highlights.length) {
    errors.push(`links: ${notes.links.length} links for ${notes.en.highlights.length} highlights`);
  }
  for (const field of ["highlights", "fixes"]) {
    const counts = locales.map((locale) => notes[locale][field].length);
    if (new Set(counts).size > 1) {
      errors.push(`${field}: languages have different item counts (${locales.map((l, i) => `${l} ${counts[i]}`).join(", ")})`);
    }
  }
  if (locales.every((locale) => !notes[locale].highlights.length && !notes[locale].fixes.length)) {
    errors.push("No items at all");
  }
  if (!notes.isMilestone && notes.en.highlights.length > 6) warnings.push(`highlights: ${notes.en.highlights.length} items, group related changes`);
  if (!notes.isMilestone && notes.en.fixes.length > 5) warnings.push(`fixes: ${notes.en.fixes.length} items, group related changes`);

  const trimmed = [];
  for (const locale of locales) {
    const { text, shown } = fitDiscord(notes, locale);
    const total = notes[locale].highlights.length + notes[locale].fixes.length;
    if (text.length > DISCORD_LIMIT) errors.push(`Discord ${locale}: ${text.length} characters, the limit is ${DISCORD_LIMIT}`);
    else if (shown < total) trimmed.push(`${locale} ${shown}/${total}`);
  }
  if (trimmed.length) {
    console.log(`Discord: shorter messages with a link to the full release notes (${trimmed.join(", ")})`);
  }

  const cover = coverErrors(version);
  if (cover === null) warnings.push(`No release-notes/covers/${version}.webp: the release will ship with cards without art`);
  else errors.push(...cover);

  return { errors, warnings };
}

function load(version) {
  const notes = readNotes(version);
  const { errors, warnings } = validate(notes, version);
  for (const warning of warnings) console.log(IN_ACTIONS ? `::warning::${warning}` : `Warning: ${warning}`);
  if (errors.length) throw new NotesError(errors.map((error) => `- ${error}`).join("\n"));
  return notes;
}

function apiPayload(notes, editOnly) {
  const content = {};
  const links = Array.isArray(notes.links) ? notes.links : null;
  for (const locale of notesLocales(notes)) {
    const { title, subtitle, highlights, fixes } = notes[locale];
    content[locale] = { ...(title ? { title } : {}), subtitle, highlights, ...(links ? { links } : {}), fixes };
  }
  const cover = readCover(notes.version);
  return {
    isMilestone: notes.isMilestone === true,
    content,
    ...(cover ? { cover } : {}),
    discord: {
      message: renderDiscord(notes, "en"),
      threadName: threadName(notes),
      threadMessages: threadLocales(notes).map((locale) => ({ key: locale, content: renderDiscord(notes, locale) })),
      editOnly
    }
  };
}

async function github(pathname, init = {}) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) fail("No GH_TOKEN");
  const response = await fetch(`https://api.github.com/repos/${REPO}${pathname}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {})
    },
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) fail(`GitHub ${init.method || "GET"} ${pathname}: ${response.status} ${await response.text()}`);
  return response.json();
}

async function findRelease(version) {
  const releases = await github("/releases?per_page=100");
  return releases.find((release) => release.tag_name === version) ?? null;
}

async function updateGithub(release, notes, publish, coverUrl) {
  const patch = { body: renderGithub(notes, coverUrl) };
  if (publish && release.draft) {
    const names = new Set(release.assets.map((asset) => asset.name));
    const required = ["latest.yml", "latest-linux.yml", `grubie-launcher-${notes.version}-portable.zip`];
    if (process.env.REQUIRE_MAC_ASSETS === "true") required.push("latest-mac.yml");
    const missing = required.filter((name) => !names.has(name));
    if (missing.length) fail(`The ${notes.version} draft has no ${missing.join(", ")}: the build did not upload everything`);
    patch.draft = false;
  }
  const updated = await github(`/releases/${release.id}`, { method: "PATCH", body: JSON.stringify(patch) });
  console.log(`GitHub: ${patch.draft === false ? "release published" : "text updated"}: ${updated.html_url}`);
}

function agentToken() {
  const token = (process.env.RELEASE_AGENT_TOKEN || "").trim();
  if (!token) fail("No RELEASE_AGENT_TOKEN secret in the repository settings");
  return token;
}

async function agentPut(pathname, payload, { allowMissing = false } = {}) {
  const token = agentToken();
  const url = `${API_URL}/agent/launcher-releases/${pathname}`;
  const body = JSON.stringify(payload);
  let lastError = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-release-token": token },
        body,
        signal: AbortSignal.timeout(60_000)
      });
      const text = await response.text();
      if (response.ok) return JSON.parse(text);
      if (response.status === 404 && allowMissing) return null;
      lastError = `${response.status} ${text}`;
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error.message;
    }
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 10_000));
  }
  fail(`api: ${lastError}`);
}

async function publishToApi(notes, editOnly) {
  const result = await agentPut(encodeURIComponent(notes.version), apiPayload(notes, editOnly));
  console.log(`What's New: published for ${notes.version}`);
  const coverUrl = result.release?.cover?.url ?? null;
  console.log(coverUrl ? `Cover: ${coverUrl}` : "Cover: none");
  if (result.discord) {
    console.log(`Discord: https://discord.com/channels/${GUILD_ID}/${result.discord.channelId}/${result.discord.messageId}`);
  } else {
    console.log("Discord: this release has no announcement, no new one is posted");
  }
  return coverUrl;
}

async function publishCoverToApi(version) {
  const cover = readCover(version);
  if (!cover) {
    console.log(`${version}: no cover, skipped`);
    return;
  }
  const result = await agentPut(`${encodeURIComponent(version)}/cover`, cover, { allowMissing: true });
  if (!result) {
    console.log(`${version}: not in What's New yet, the cover waits for the release`);
    return;
  }
  console.log(`${version}: cover ${result.release.cover.url}`);
}

function changedVersions(base) {
  const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  let from = base && !/^0+$/.test(base) ? base : "";
  try {
    if (from) git("cat-file", "-e", `${from}^{commit}`);
  } catch {
    from = "";
  }
  const output = git("diff", "--name-only", "--diff-filter=AM", from || "HEAD~1", "HEAD", "--", "release-notes");
  const versions = output
    .split("\n")
    .map((line) => line.match(/^release-notes\/(?:covers\/)?(\d+\.\d+\.\d+)(?:\.github)?\.(?:json|webp|jpg)$/)?.[1])
    .filter(Boolean);
  return [...new Set(versions)];
}

function printPreview(notes) {
  const section = (title, text) => console.log(`\n===== ${title} =====\n${text}`);
  const cover = coverPath(notes.version, "webp");
  section(
    "Обложка",
    fs.existsSync(cover) ? `${path.relative(ROOT, cover)} (${Math.round(fs.statSync(cover).size / 1024)} КБ)` : "нет"
  );
  section("GitHub-релиз (EN)", renderGithub(notes));
  for (const locale of notesLocales(notes)) section(`Что нового — ${locale.toUpperCase()}`, renderWhatsNew(notes, locale));
  section(
    `Discord #⚙・change-log (EN) — ${renderDiscord(notes, "en").length}/${DISCORD_LIMIT}`,
    renderDiscord(notes, "en")
  );
  for (const locale of threadLocales(notes)) {
    const text = renderDiscord(notes, locale);
    section(`Discord ветка «${threadName(notes)}», заблокирована (${locale.toUpperCase()}) — ${text.length}/${DISCORD_LIMIT}`, text);
  }
  console.log(`\nisMilestone: ${notes.isMilestone === true}`);
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const positional = args.find((arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--"));
  const version = option(args, "--version") || positional || packageVersion();

  if (command === "check" || command === "preview") {
    const tag = option(args, "--tag");
    if (tag && tag !== version) throw new NotesError(`Tag ${tag} does not match version ${version} in package.json`);
    const notes = load(version);
    if (command === "preview") printPreview(notes);
    else console.log(`release-notes/${version}.json is fine`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
    return;
  }

  if (command === "publish") {
    agentToken();
    const notes = load(version);
    const release = await findRelease(version);
    if (!release) fail(`No ${version} release on GitHub: the build did not create it`);
    await updateGithub(release, notes, true);
    const coverUrl = await publishToApi(notes, false);
    const image = githubCover(version) ?? coverUrl;
    if (image) await updateGithub(release, notes, false, image);
    return;
  }

  if (command === "sync") {
    agentToken();
    const versions = changedVersions(option(args, "--since"));
    if (!versions.length) {
      console.log("No release notes changed");
      return;
    }
    for (const changed of versions) {
      if (!fs.existsSync(notesPath(changed))) {
        await publishCoverToApi(changed);
        continue;
      }
      const notes = load(changed);
      const release = await findRelease(changed);
      if (!release || release.draft) {
        console.log(`${changed}: not published yet, Release Launcher will publish the texts`);
        continue;
      }
      const coverUrl = await publishToApi(notes, true);
      await updateGithub(release, notes, false, githubCover(changed) ?? coverUrl);
    }
    return;
  }

  console.log(`Использование:
  node .github/scripts/release-notes.mjs check [версия] [--tag <тег>]   проверить release-notes/<версия>.json
  node .github/scripts/release-notes.mjs preview [версия]               показать тексты всех каналов
  node .github/scripts/release-notes.mjs publish [версия]               CI: опубликовать GitHub-релиз, «Что нового» и Discord
  node .github/scripts/release-notes.mjs sync --since <sha>             CI: применить правки заметок и обложек к опубликованным релизам

Обложка версии — release-notes/covers/<версия>.webp и .jpg; у старых версий может быть без файла заметок.

Без версии берётся version из package.json.`);
  process.exit(command ? 1 : 0);
}

main().catch((error) => {
  if (error instanceof NotesError) fail(error.message);
  throw error;
});
