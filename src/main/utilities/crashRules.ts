import { CrashRule, CrashRuleMessages } from "@/types/CrashAnalysis";

export const BUILT_IN_CRASH_RULES: CrashRule[] = [
  {
    id: "out_of_memory",
    pattern: "java\\.lang\\.OutOfMemoryError",
    messages: {
      en: "The game ran out of memory. Increase the memory limit in the launcher settings.",
      ru: "Игре не хватило оперативной памяти. Увеличьте лимит памяти в настройках лаунчера.",
      uk: "Грі забракло оперативної пам'яті. Збільште ліміт пам'яті в налаштуваннях лаунчера.",
    },
  },
  {
    id: "unsupported_java",
    pattern:
      "UnsupportedClassVersionError|requires the use of Java|class file version",
    messages: {
      en: "This Minecraft version needs a different Java. Run “Check integrity” — the launcher will install the right one.",
      ru: "Этой версии игры нужна другая Java. Запустите «Проверку целостности» — лаунчер установит нужную.",
      uk: "Цій версії гри потрібна інша Java. Запустіть «Перевірку цілісності» — лаунчер встановить потрібну.",
    },
  },
  {
    id: "optifine_conflict",
    pattern:
      "(?=[\\s\\S]*?OptiFine)(?=[\\s\\S]*?(?:MixinApplyError|InvalidMixinException|Mixin apply for mod|Mixin transformation of))",
    flags: "",
    messages: {
      en: "OptiFine conflicts with your mods. Replace it with Sodium/Embeddium from the mod manager, or remove it.",
      ru: "OptiFine конфликтует с модами. Замените его на Sodium/Embeddium из мод-менеджера или удалите.",
      uk: "OptiFine конфліктує з модами. Замініть його на Sodium/Embeddium з мод-менеджера або видаліть.",
    },
  },
  {
    id: "duplicate_mods",
    pattern: "DuplicateModsFoundException|Found duplicate mods",
    culpritPattern: "Mod ID: '([\\w-]+)'",
    messages: {
      en: "The same mod is installed twice. Open the mods folder and delete the duplicate/older copy — keep only one.",
      ru: "Один и тот же мод установлен дважды. Откройте папку mods и удалите дубликат/старую копию — оставьте только одну.",
      uk: "Один і той самий мод встановлено двічі. Відкрийте теку mods і видаліть дублікат/стару копію — залиште лише одну.",
    },
  },
  {
    id: "fabric_missing_dep",
    pattern:
      "which is missing|Unmet dependency listing|requires (any )?version .* of (mod )?[\\w-]+",
    culpritPattern: "Mod '([^']+)'",
    messages: {
      en: "A mod needs another mod that isn’t installed (missing dependency). Open the mod manager and install the required dependency, or remove the mod that needs it.",
      ru: "Моду нужен другой мод, которого нет в сборке (отсутствует зависимость). Откройте мод-менеджер и установите нужную зависимость или удалите мод, которому она требуется.",
      uk: "Моду потрібен інший мод, якого немає у збірці (відсутня залежність). Відкрийте мод-менеджер і встановіть потрібну залежність або видаліть мод, якому вона потрібна.",
    },
  },
  {
    id: "forge_missing_dep",
    pattern: "Missing or unsupported mandatory dependencies",
    culpritPattern: "Mod ID: '?([\\w-]+)'?",
    messages: {
      en: "A mod is missing a required dependency or needs a different version of one. Open the mod manager and install/update the dependency for the affected mod.",
      ru: "Моду не хватает обязательной зависимости или нужна другая её версия. Откройте мод-менеджер и установите/обновите зависимость для затронутого мода.",
      uk: "Моду бракує обов'язкової залежності або потрібна інша її версія. Відкрийте мод-менеджер і встановіть/оновіть залежність для зачепленого мода.",
    },
  },
  {
    id: "mixin_error",
    pattern:
      "MixinApplyError|InvalidMixinException|Mixin apply for mod [\\w-]+ failed|Mixin transformation of",
    culpritPattern: "(?:Mixin apply for mod|from mod) ([\\w-]+)",
    messages: {
      en: "A mod is incompatible with this game version or with another mod. Update or disable it.",
      ru: "Мод несовместим с этой версией игры или с другим модом. Обновите или отключите его.",
      uk: "Мод несумісний із цією версією гри або з іншим модом. Оновіть або вимкніть його.",
    },
  },
  {
    id: "mod_resolution",
    pattern: "ModResolutionException|Incompatible mods found",
    culpritPattern: "Mod '([^']+)'",
    messages: {
      en: "Some installed mods can’t work together (incompatible versions or a conflict). Update the affected mods to matching versions, or remove one of them in the mod manager.",
      ru: "Некоторые установленные моды не могут работать вместе (несовместимые версии или конфликт). Обновите затронутые моды до совместимых версий или удалите один из них в мод-менеджере.",
      uk: "Деякі встановлені моди не можуть працювати разом (несумісні версії або конфлікт). Оновіть зачеплені моди до сумісних версій або видаліть один із них у мод-менеджері.",
    },
  },
  {
    id: "ticking_entity",
    pattern:
      "Ticking entity|Ticking block entity|Entity being ticked|Exception ticking world|Exception in server tick loop",
    culpritPattern: "Entity Type: ([\\w:-]+)",
    messages: {
      en: "A corrupted entity or block in the world is crashing the game (“ticking entity”). Usually a mod bug — try updating mods; in singleplayer, restoring a world backup helps.",
      ru: "Повреждённая сущность или блок в мире роняет игру («ticking entity»). Обычно это баг мода — обновите моды; в одиночной игре поможет восстановление мира из бэкапа.",
      uk: "Пошкоджена сутність або блок у світі валить гру («ticking entity»). Зазвичай це баг мода — оновіть моди; в одиночній грі допоможе відновлення світу з бекапа.",
    },
  },
  {
    id: "stack_overflow",
    pattern: "java\\.lang\\.StackOverflowError",
    messages: {
      en: "Infinite loop between mods (StackOverflowError). Disable recently added mods one by one to find the conflict.",
      ru: "Бесконечный цикл между модами (StackOverflowError). Отключайте недавно добавленные моды по одному, чтобы найти конфликт.",
      uk: "Нескінченний цикл між модами (StackOverflowError). Вимикайте нещодавно додані моди по одному, щоб знайти конфлікт.",
    },
  },
  {
    id: "missing_registries",
    pattern:
      "MissingMappingsException|Missing required registries|holder is not present|Unknown registry",
    messages: {
      en: "The world contains blocks/items from mods that are no longer installed. Re-add the removed mods or use a world backup.",
      ru: "В мире есть блоки/предметы модов, которых больше нет в сборке. Верните удалённые моды или восстановите мир из бэкапа.",
      uk: "У світі є блоки/предмети модів, яких більше немає в збірці. Поверніть видалені моди або відновіть світ із бекапа.",
    },
  },
  {
    id: "watchdog",
    pattern: "ServerHangWatchdog|A single server tick took",
    messages: {
      en: "The game froze on a heavy tick and was killed by the watchdog. Usually an overloaded mod, a chunk with too many entities, or heavy redstone.",
      ru: "Игра зависла на тяжёлом тике и была остановлена watchdog'ом. Обычно виноват перегруженный мод, чанк с кучей сущностей или тяжёлая редстоун-схема.",
      uk: "Гра зависла на важкому тику й була зупинена watchdog'ом. Зазвичай винен перевантажений мод, чанк із купою сутностей або важка редстоун-схема.",
    },
  },
  {
    id: "auth_invalid_session",
    pattern:
      "Invalid session|Failed to verify username|Authentication servers are down|Не удалось проверить имя пользователя",
    messages: {
      en: "The game session expired. Re-select your account in the launcher (or re-login) and start the game again.",
      ru: "Игровая сессия устарела. Перевыберите аккаунт в лаунчере (или перезайдите в него) и запустите игру снова.",
      uk: "Ігрова сесія застаріла. Перевиберіть акаунт у лаунчері (або перезайдіть у нього) і запустіть гру знову.",
    },
  },
  {
    id: "gl_error",
    pattern:
      "GLFW error|Failed to create display|does not appear to support OpenGL|Couldn't set pixel format|ail to create window",
    messages: {
      en: "Graphics driver problem. Update your GPU driver and try again.",
      ru: "Проблема с видеодрайвером. Обновите драйвер видеокарты и попробуйте снова.",
      uk: "Проблема з відеодрайвером. Оновіть драйвер відеокарти та спробуйте знову.",
    },
  },
  {
    id: "disk_full",
    pattern:
      "There is not enough space on the disk|No space left on device|Недостаточно места на диске",
    messages: {
      en: "The disk is full — the game cannot save data. Free up disk space.",
      ru: "Диск заполнен — игре некуда сохранять данные. Освободите место на диске.",
      uk: "Диск заповнений — грі нікуди зберігати дані. Звільніть місце на диску.",
    },
  },
  {
    id: "access_denied",
    pattern:
      "java\\.io\\.IOException: Access is denied|AccessDeniedException|Отказано в доступе",
    messages: {
      en: "Windows blocked access to game files. Add the launcher folder to your antivirus exclusions and check folder permissions.",
      ru: "Windows заблокировала доступ к файлам игры. Добавьте папку лаунчера в исключения антивируса и проверьте права на папку.",
      uk: "Windows заблокувала доступ до файлів гри. Додайте теку лаунчера у винятки антивіруса та перевірте права на теку.",
    },
  },
  {
    id: "world_corrupt",
    pattern:
      "ChunkIoLoadFailure|Failed to load level|Corrupted chunk|RegionFile .* corrupt",
    messages: {
      en: "The world save looks corrupted. Restore the world from a backup; mods that touch world generation are the usual cause.",
      ru: "Сохранение мира повреждено. Восстановите мир из бэкапа; обычно виноваты моды, меняющие генерацию мира.",
      uk: "Збереження світу пошкоджене. Відновіть світ із бекапа; зазвичай винні моди, що змінюють генерацію світу.",
    },
  },
  {
    id: "corrupted_files",
    pattern:
      "Invalid or corrupt jarfile|error in opening zip file|Unexpected end of ZLIB input stream|zip END header not found|zip file is empty|Could not find or load main class|NoClassDefFoundError|ClassNotFoundException",
    culpritPattern: "(?:corrupt jarfile|opening zip file)\\s+\\S*?([^\\s/\\\\:]+\\.jar)",
    messages: {
      en: "A game or mod file is damaged and won’t open (corrupted .jar/archive). If a file is named below, delete and re-download that mod; otherwise run “Check integrity” in the version settings to restore game files.",
      ru: "Файл игры или мода повреждён и не открывается (битый .jar/архив). Если файл указан ниже — удалите и скачайте этот мод заново; иначе запустите «Проверку целостности» в настройках сборки, чтобы восстановить файлы игры.",
      uk: "Файл гри або мода пошкоджений і не відкривається (битий .jar/архів). Якщо файл указано нижче — видаліть і завантажте цей мод заново; інакше запустіть «Перевірку цілісності» в налаштуваннях збірки, щоб відновити файли гри.",
    },
  },
  {
    id: "native_crash",
    exitCodes: [-1073740791, -1073741819, 1073740791, 3221226505],
    messages: {
      en: "The game crashed at the system level. Most often: outdated GPU driver or overlays (Discord, OBS, GeForce Experience). Update the driver and disable overlays.",
      ru: "Игра упала на уровне системы. Чаще всего виноват устаревший видеодрайвер или оверлеи (Discord, OBS, GeForce Experience). Обновите драйвер и отключите оверлеи.",
      uk: "Гра впала на рівні системи. Найчастіше винен застарілий відеодрайвер або оверлеї (Discord, OBS, GeForce Experience). Оновіть драйвер і вимкніть оверлеї.",
    },
  },
];

export interface CrashMatch {
  ruleId: string;
  messages: CrashRuleMessages;
  culprits: string[];
}

function isValidRule(rule: unknown): rule is CrashRule {
  const candidate = rule as Partial<CrashRule> | null;
  if (!candidate || typeof candidate.id !== "string") return false;

  const hasPattern = typeof candidate.pattern === "string";
  const hasExitCodes =
    Array.isArray(candidate.exitCodes) &&
    candidate.exitCodes.length > 0 &&
    candidate.exitCodes.every((code) => typeof code === "number");
  if (!hasPattern && !hasExitCodes) return false;

  const messages = candidate.messages as Partial<CrashRuleMessages> | undefined;
  return (
    !!messages &&
    typeof messages.en === "string" &&
    typeof messages.ru === "string" &&
    typeof messages.uk === "string"
  );
}

export function sanitizeCrashRules(rules: unknown): CrashRule[] {
  if (!Array.isArray(rules)) return [];

  return rules.filter((rule) => {
    if (!isValidRule(rule)) return false;

    try {
      if (rule.pattern) new RegExp(rule.pattern, rule.flags || "i");
      if (rule.culpritPattern) {
        new RegExp(rule.culpritPattern, rule.culpritFlags || "gi");
      }
      return true;
    } catch {
      return false;
    }
  });
}

function extractCulprits(rule: CrashRule, text: string): string[] {
  if (!rule.culpritPattern || !text) return [];

  const culprits = new Set<string>();
  try {
    const culpritPattern = new RegExp(
      rule.culpritPattern,
      rule.culpritFlags || "gi",
    );
    let match: RegExpExecArray | null;
    while ((match = culpritPattern.exec(text)) && culprits.size < 5) {
      if (match[1]) culprits.add(match[1]);
      if (match.index === culpritPattern.lastIndex) {
        culpritPattern.lastIndex += 1;
      }
    }
  } catch {}

  return [...culprits];
}

function stripLogPrefix(line: string): string {
  return line.replace(/^(?:\[[^\]]*\]\s*)+:?\s*/, "");
}

const NON_FATAL_LOG_LINE = /Error rendering overlay|could not find refmap file/i;

function sanitizeSignature(line: string): string {
  return line
    .replace(/[A-Za-z]:\\[^\s"']+/g, (match) => match.split(/[\\/]/).pop() || match)
    .replace(/\/(?:[^\s"'/]+\/)+([^\s"'/]+)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractCrashSignature(text: string, exitCode?: number): string {
  const parts: string[] = [];

  if (text) {
    const description = text.match(/^\s*Description:\s*(.+)$/m);
    if (description?.[1]) parts.push(description[1].trim());

    const relevant =
      /[\w.$]*(?:Exception|Error)\b|invalid or corrupt|could not (?:find|load)|error in opening zip|unexpected end of|no space left|caused by|failed to|fatal/i;
    const errorLine = text
      .split(/\r?\n/)
      .map((line) => stripLogPrefix(line.trim()))
      .find(
        (line) =>
          line &&
          !/^Description:/i.test(line) &&
          relevant.test(line) &&
          !NON_FATAL_LOG_LINE.test(line),
      );
    if (errorLine && !parts.includes(errorLine)) parts.push(errorLine);
  }

  if (parts.length === 0 && typeof exitCode === "number") {
    parts.push(`exit code ${exitCode}`);
  }

  return sanitizeSignature(parts.join(" | ")).slice(0, 200);
}

export function matchCrashRules(
  text: string,
  rules: CrashRule[] = BUILT_IN_CRASH_RULES,
  exitCode?: number,
): CrashMatch | null {
  for (const rule of rules) {
    let matched = false;

    if (rule.pattern && text) {
      try {
        matched = new RegExp(rule.pattern, rule.flags ?? "i").test(text);
      } catch {
        matched = false;
      }
    }

    if (
      !matched &&
      typeof exitCode === "number" &&
      rule.exitCodes?.includes(exitCode)
    ) {
      matched = true;
    }

    if (!matched) continue;

    return {
      ruleId: rule.id,
      messages: rule.messages,
      culprits: extractCulprits(rule, text),
    };
  }

  return null;
}
