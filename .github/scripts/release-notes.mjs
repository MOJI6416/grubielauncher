import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NOTES_DIR = path.join(ROOT, "release-notes");
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

function fail(message) {
  console.error(IN_ACTIONS ? `::error::${message.replace(/\n/g, "%0A")}` : `Ошибка:\n${message}`);
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
    throw new NotesError(`Нет файла release-notes/${version}.json — тексты релиза пишет скилл grubie-release-writer`);
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new NotesError(`release-notes/${version}.json — не JSON: ${error.message}`);
  }
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

function renderDiscord(notes, locale) {
  const template = DISCORD[locale];
  const content = notes[locale];
  const parts = [template.available(notes.version)];
  if (content.highlights.length) parts.push(`${template.highlights}\n${bulletList(content.highlights, true)}`);
  if (content.fixes.length) parts.push(`${template.fixes}\n${bulletList(content.fixes, true)}`);
  parts.push(template.role ? `${template.report}\n\n<@&${template.role}>` : template.report);
  return parts.join("\n\n");
}

function renderGithub(notes) {
  const content = notes.en;
  const parts = [`## Grubie Launcher ${notes.version}`, content.subtitle];
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
    return { errors: ["Файл должен быть JSON-объектом"], warnings };
  }

  const known = new Set(["version", "isMilestone", ...LOCALES]);
  for (const key of Object.keys(notes)) {
    if (!known.has(key)) errors.push(`Неизвестное поле «${key}»`);
  }
  if (notes.version !== version) errors.push(`version в файле («${notes.version}») не совпадает с ${version}`);
  if (!/^\d+\.\d+\.\d+$/.test(String(notes.version))) errors.push(`Версия «${notes.version}» не вида X.Y.Z`);
  if (notes.isMilestone !== undefined && typeof notes.isMilestone !== "boolean") {
    errors.push("isMilestone должен быть true или false");
  }

  for (const locale of LOCALES) {
    const content = notes[locale];
    if (content === undefined && !REQUIRED_LOCALES.includes(locale)) continue;
    if (!content || typeof content !== "object" || Array.isArray(content)) {
      errors.push(`Нет блока «${locale}»`);
      continue;
    }
    for (const key of Object.keys(content)) {
      if (!["title", "subtitle", "highlights", "fixes"].includes(key)) errors.push(`${locale}: неизвестное поле «${key}»`);
    }
    if (content.title !== undefined && (typeof content.title !== "string" || !content.title.trim())) {
      errors.push(`${locale}.title: пустой заголовок — уберите поле, тогда будет «Grubie Launcher ${version}»`);
    }
    if (typeof content.subtitle !== "string" || !content.subtitle.trim()) {
      errors.push(`${locale}.subtitle: нужен подзаголовок в одно предложение`);
    } else {
      if (content.subtitle.length > 160) warnings.push(`${locale}.subtitle: длиннее 160 символов`);
      if (!/[.!?]$/.test(content.subtitle)) warnings.push(`${locale}.subtitle: нет точки в конце`);
    }

    for (const field of ["highlights", "fixes"]) {
      const items = content[field];
      if (!Array.isArray(items)) {
        errors.push(`${locale}.${field}: должен быть массивом (пустой — [])`);
        continue;
      }
      if (items.length > 12) errors.push(`${locale}.${field}: больше 12 пунктов`);
      items.forEach((item, index) => {
        const where = `${locale}.${field}[${index}]`;
        if (typeof item !== "string" || !item.trim()) {
          errors.push(`${where}: пустой пункт`);
          return;
        }
        if (item !== item.trim() || /\n/.test(item)) errors.push(`${where}: пробелы по краям или перенос строки`);
        if (/^[-–—•*]/.test(item)) errors.push(`${where}: маркер списка ставит шаблон, уберите «${item[0]}»`);
        if (!/[.!?]$/.test(item)) warnings.push(`${where}: нет точки в конце`);
        if (/^\p{Ll}/u.test(item)) warnings.push(`${where}: начинается с маленькой буквы`);
        if (item.length > 220) warnings.push(`${where}: длиннее 220 символов — сократите`);
        if (field === "fixes" && FIX_PREFIX[locale].test(item)) {
          warnings.push(`${where}: под заголовком «${WHATS_NEW[locale].fixes}» не начинайте с «${item.split(" ")[0]}» — опишите, что теперь работает`);
        }
        if (INFORMAL[locale]?.test(item)) warnings.push(`${where}: обращение на «ты» — в лаунчере везде «вы»`);
        if (INTERNAL.test(item)) warnings.push(`${where}: похоже на внутреннее название (${item.match(INTERNAL)[0]})`);
      });
    }
  }

  if (errors.length) return { errors, warnings };

  const locales = notesLocales(notes);
  for (const field of ["highlights", "fixes"]) {
    const counts = locales.map((locale) => notes[locale][field].length);
    if (new Set(counts).size > 1) {
      errors.push(`${field}: разное число пунктов в языках (${locales.map((l, i) => `${l} ${counts[i]}`).join(", ")})`);
    }
  }
  if (locales.every((locale) => !notes[locale].highlights.length && !notes[locale].fixes.length)) {
    errors.push("Нет ни одного пункта");
  }
  if (notes.en.highlights.length > 6) warnings.push(`highlights: ${notes.en.highlights.length} пунктов — длинный список, сгруппируйте связанные изменения`);
  if (notes.en.fixes.length > 5) warnings.push(`fixes: ${notes.en.fixes.length} пунктов — длинный список, сгруппируйте связанные изменения`);

  for (const locale of locales) {
    const length = renderDiscord(notes, locale).length;
    if (length > DISCORD_LIMIT) errors.push(`Discord ${locale}: ${length} символов при лимите ${DISCORD_LIMIT}`);
  }

  return { errors, warnings };
}

function load(version) {
  const notes = readNotes(version);
  const { errors, warnings } = validate(notes, version);
  for (const warning of warnings) console.log(IN_ACTIONS ? `::warning::${warning}` : `Предупреждение: ${warning}`);
  if (errors.length) throw new NotesError(errors.map((error) => `- ${error}`).join("\n"));
  return notes;
}

function apiPayload(notes, editOnly) {
  const content = {};
  for (const locale of notesLocales(notes)) {
    const { title, subtitle, highlights, fixes } = notes[locale];
    content[locale] = { ...(title ? { title } : {}), subtitle, highlights, fixes };
  }
  return {
    isMilestone: notes.isMilestone === true,
    content,
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
  if (!token) fail("Нет GH_TOKEN");
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

async function updateGithub(release, notes, publish) {
  const patch = { body: renderGithub(notes) };
  if (publish && release.draft) {
    const names = new Set(release.assets.map((asset) => asset.name));
    const required = ["latest.yml", "latest-linux.yml"];
    if (process.env.REQUIRE_MAC_ASSETS === "true") required.push("latest-mac.yml");
    const missing = required.filter((name) => !names.has(name));
    if (missing.length) fail(`В черновике ${notes.version} нет ${missing.join(", ")} — сборка выложила не всё`);
    patch.draft = false;
  }
  const updated = await github(`/releases/${release.id}`, { method: "PATCH", body: JSON.stringify(patch) });
  console.log(`GitHub: ${patch.draft === false ? "релиз опубликован" : "текст обновлён"} — ${updated.html_url}`);
}

function agentToken() {
  const token = (process.env.RELEASE_AGENT_TOKEN || "").trim();
  if (!token) fail("Нет секрета RELEASE_AGENT_TOKEN в настройках репозитория");
  return token;
}

async function publishToApi(notes, editOnly) {
  const token = agentToken();
  const url = `${API_URL}/agent/launcher-releases/${encodeURIComponent(notes.version)}`;
  const body = JSON.stringify(apiPayload(notes, editOnly));
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
      if (response.ok) {
        const result = JSON.parse(text);
        console.log(`Что нового: опубликовано для ${notes.version}`);
        if (result.discord) {
          console.log(`Discord: https://discord.com/channels/${GUILD_ID}/${result.discord.channelId}/${result.discord.messageId}`);
        } else {
          console.log("Discord: анонса этого релиза нет, новый не публикуется");
        }
        return;
      }
      lastError = `${response.status} ${text}`;
      if (response.status < 500) break;
    } catch (error) {
      lastError = error.message;
    }
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 10_000));
  }
  fail(`api: ${lastError}`);
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
  return output
    .split("\n")
    .map((line) => line.match(/^release-notes\/(\d+\.\d+\.\d+)\.json$/)?.[1])
    .filter(Boolean);
}

function printPreview(notes) {
  const section = (title, text) => console.log(`\n===== ${title} =====\n${text}`);
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
    if (tag && tag !== version) throw new NotesError(`Тег ${tag} не совпадает с версией ${version} в package.json`);
    const notes = load(version);
    if (command === "preview") printPreview(notes);
    else console.log(`release-notes/${version}.json в порядке`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
    return;
  }

  if (command === "publish") {
    agentToken();
    const notes = load(version);
    const release = await findRelease(version);
    if (!release) fail(`На GitHub нет релиза ${version} — сборка его не создала`);
    await updateGithub(release, notes, true);
    await publishToApi(notes, false);
    return;
  }

  if (command === "sync") {
    agentToken();
    const versions = changedVersions(option(args, "--since"));
    if (!versions.length) {
      console.log("Заметки релизов не менялись");
      return;
    }
    for (const changed of versions) {
      const notes = load(changed);
      const release = await findRelease(changed);
      if (!release || release.draft) {
        console.log(`${changed}: релиз ещё не опубликован — тексты выпустит Release Launcher`);
        continue;
      }
      await updateGithub(release, notes, false);
      await publishToApi(notes, true);
    }
    return;
  }

  console.log(`Использование:
  node .github/scripts/release-notes.mjs check [версия] [--tag <тег>]   проверить release-notes/<версия>.json
  node .github/scripts/release-notes.mjs preview [версия]               показать тексты всех каналов
  node .github/scripts/release-notes.mjs publish [версия]               CI: опубликовать GitHub-релиз, «Что нового» и Discord
  node .github/scripts/release-notes.mjs sync --since <sha>             CI: применить правки заметок к опубликованным релизам

Без версии берётся version из package.json.`);
  process.exit(command ? 1 : 0);
}

main().catch((error) => {
  if (error instanceof NotesError) fail(error.message);
  throw error;
});
