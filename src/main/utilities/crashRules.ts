import { CrashRule, CrashRuleMessages } from "@/types/CrashAnalysis";
import { redactSecrets } from "@/shared/logSanitizer";

export const BUILT_IN_CRASH_RULES: CrashRule[] = [
  {
    id: "out_of_memory",
    priority: 74,
    pattern: "java\\.lang\\.OutOfMemoryError",
    messages: {
      en: "The game ran out of memory. Increase the memory limit in the launcher settings.",
      ru: "Игре не хватило оперативной памяти. Увеличьте лимит памяти в настройках лаунчера.",
      uk: "Грі забракло оперативної пам'яті. Збільште ліміт пам'яті в налаштуваннях лаунчера.",
    },
  },
  {
    id: "unsupported_java",
    priority: 80,
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
    priority: 95,
    allPatterns: [
      "OptiFine",
      "MixinApplyError|InvalidMixinException|Mixin apply for mod|Mixin transformation of",
    ],
    flags: "",
    messages: {
      en: "OptiFine conflicts with your mods. Replace it with Sodium/Embeddium from the mod manager, or remove it.",
      ru: "OptiFine конфликтует с модами. Замените его на Sodium/Embeddium из мод-менеджера или удалите.",
      uk: "OptiFine конфліктує з модами. Замініть його на Sodium/Embeddium з мод-менеджера або видаліть.",
    },
  },
  {
    id: "duplicate_mods",
    priority: 90,
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
    priority: 86,
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
    priority: 88,
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
    priority: 35,
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
    priority: 84,
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
    priority: 45,
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
    priority: 60,
    pattern: "java\\.lang\\.StackOverflowError",
    messages: {
      en: "Infinite loop between mods (StackOverflowError). Disable recently added mods one by one to find the conflict.",
      ru: "Бесконечный цикл между модами (StackOverflowError). Отключайте недавно добавленные моды по одному, чтобы найти конфликт.",
      uk: "Нескінченний цикл між модами (StackOverflowError). Вимикайте нещодавно додані моди по одному, щоб знайти конфлікт.",
    },
  },
  {
    id: "missing_registries",
    priority: 82,
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
    priority: 45,
    pattern: "ServerHangWatchdog|A single server tick took",
    messages: {
      en: "The game froze on a heavy tick and was killed by the watchdog. Usually an overloaded mod, a chunk with too many entities, or heavy redstone.",
      ru: "Игра зависла на тяжёлом тике и была остановлена watchdog'ом. Обычно виноват перегруженный мод, чанк с кучей сущностей или тяжёлая редстоун-схема.",
      uk: "Гра зависла на важкому тику й була зупинена watchdog'ом. Зазвичай винен перевантажений мод, чанк із купою сутностей або важка редстоун-схема.",
    },
  },
  {
    id: "auth_invalid_session",
    priority: 70,
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
    priority: 66,
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
    priority: 78,
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
    priority: 76,
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
    priority: 72,
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
    priority: 68,
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
    priority: 20,
    exitCodes: [-1073741819, 3221225477, -1073740791, 3221226505],
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
  const hasAllPatterns =
    Array.isArray(candidate.allPatterns) && candidate.allPatterns.length > 0;
  const hasExitCodes =
    Array.isArray(candidate.exitCodes) &&
    candidate.exitCodes.length > 0 &&
    candidate.exitCodes.every((code) => typeof code === "number");
  if (!hasPattern && !hasAllPatterns && !hasExitCodes) return false;

  const messages = candidate.messages as Partial<CrashRuleMessages> | undefined;
  return (
    !!messages &&
    typeof messages.en === "string" &&
    typeof messages.ru === "string" &&
    typeof messages.uk === "string"
  );
}

const MAX_PATTERN_LENGTH = 500;
const MAX_PATTERNS_PER_RULE = 8;
const MAX_REMOTE_RULES = 200;
export const DEFAULT_CRASH_RULE_PRIORITY = 50;
const MAX_CRASH_RULE_PRIORITY = 1000;
const MAX_ADJACENT_QUANTIFIERS = 2;
const MAX_UNGATED_QUANTIFIERS = 1;
const MAX_UNGATED_UNSTOPPABLE = 0;
const MAX_PAIRED_UNSTOPPABLE = 0;
const MAX_AMBIGUOUS_ALTERNATION = 0;
const BROAD_SET_SIZE = 32;

const GROUP_PREFIX = /^\?(?::|=|!|<[=!]|<[A-Za-z_$][\w$]*>)/;

const OPEN_RANGE = /^\{\d*,\d*\}/;

const REPEAT_EXPANSION_CAP = MAX_ADJACENT_QUANTIFIERS + 1;
const MAX_EXPANDED_ATOMS = 1000;
const LARGE_REPEAT_BOUND = 128;
const MAX_WEIGHT_PRODUCT = 16384;

function isQuantifierAt(pattern: string, index: number): boolean {
  const char = pattern[index];
  if (char === "*" || char === "+") return true;
  return char === "{" && OPEN_RANGE.test(pattern.slice(index));
}

function findQuantifiedGroups(pattern: string): string[] {
  const bodies: string[] = [];
  const stack: number[] = [];
  let escaped = false;
  let inClass = false;

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (inClass) {
      if (char === "]") inClass = false;
      continue;
    }
    if (char === "[") {
      inClass = true;
      continue;
    }
    if (char === "(") {
      stack.push(index);
      continue;
    }
    if (char === ")") {
      const start = stack.pop();
      if (start === undefined) continue;
      if (isQuantifierAt(pattern, index + 1)) {
        const body = pattern.slice(start + 1, index);
        bodies.push(body.replace(GROUP_PREFIX, ""));
      }
    }
  }

  return bodies;
}

function containsQuantifier(body: string): boolean {
  let escaped = false;
  let inClass = false;
  let previous = "";

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];

    if (escaped) {
      escaped = false;
      previous = "";
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (inClass) {
      if (char === "]") inClass = false;
      continue;
    }
    if (char === "[") {
      inClass = true;
      previous = char;
      continue;
    }

    if (char === "*" || char === "+") return true;
    if (char === "?" && previous !== "(") return true;
    if (char === "{" && OPEN_RANGE.test(body.slice(index))) return true;

    previous = char;
  }

  return false;
}

function containsAlternation(body: string): boolean {
  let escaped = false;
  let inClass = false;

  for (const char of body) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (inClass) {
      if (char === "]") inClass = false;
      continue;
    }
    if (char === "[") {
      inClass = true;
      continue;
    }
    if (char === "|") return true;
  }

  return false;
}

const LOOKAROUND_PREFIX = /^\?(?:=|!|<[=!])/;

interface CharSet {
  readonly chars: ReadonlySet<string>;
  readonly negated: boolean;
  readonly unknown: boolean;
}

const UNKNOWN_SET: CharSet = {
  chars: new Set(),
  negated: false,
  unknown: true,
};
const EMPTY_SET: CharSet = { chars: new Set(), negated: false, unknown: false };

const DIGITS = "0123456789";
const WORD_CHARS = `${DIGITS}abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_`;
const SPACE_CHARS = " \t\n\r\f\v    ﻿";

const SHORTHAND_SETS: Record<string, CharSet> = {
  d: { chars: new Set(DIGITS), negated: false, unknown: false },
  D: { chars: new Set(DIGITS), negated: true, unknown: false },
  w: { chars: new Set(WORD_CHARS), negated: false, unknown: false },
  W: { chars: new Set(WORD_CHARS), negated: true, unknown: false },
  s: { chars: new Set(SPACE_CHARS), negated: false, unknown: false },
  S: { chars: new Set(SPACE_CHARS), negated: true, unknown: false },
};

const CONTROL_ESCAPES: Record<string, string> = {
  n: "\n",
  r: "\r",
  t: "\t",
  f: "\f",
  v: "\v",
  "0": "\0",
};

const DOT_SET: CharSet = {
  chars: new Set("\n\r  "),
  negated: true,
  unknown: false,
};

function literalSet(char: string): CharSet {
  return { chars: new Set([char]), negated: false, unknown: false };
}

function intersect(left: CharSet, right: CharSet): CharSet {
  if (left.unknown) return right;
  if (right.unknown) return left;

  if (!left.negated && !right.negated) {
    const chars = new Set<string>();
    for (const char of left.chars) {
      if (right.chars.has(char)) chars.add(char);
    }
    return { chars, negated: false, unknown: false };
  }

  if (left.negated && right.negated) {
    const chars = new Set(left.chars);
    for (const char of right.chars) chars.add(char);
    return { chars, negated: true, unknown: false };
  }

  const positive = left.negated ? right : left;
  const negative = left.negated ? left : right;
  const chars = new Set<string>();
  for (const char of positive.chars) {
    if (!negative.chars.has(char)) chars.add(char);
  }
  return { chars, negated: false, unknown: false };
}

function isEmptySet(set: CharSet): boolean {
  return !set.negated && !set.unknown && set.chars.size === 0;
}

function isSubsetOf(inner: CharSet, outer: CharSet): boolean {
  if (outer.unknown) return true;
  if (inner.unknown) return outer.negated && outer.chars.size === 0;

  if (!outer.negated) {
    if (inner.negated) return false;
    for (const char of inner.chars) {
      if (!outer.chars.has(char)) return false;
    }
    return true;
  }

  if (inner.negated) {
    for (const char of outer.chars) {
      if (!inner.chars.has(char)) return false;
    }
    return true;
  }

  for (const char of inner.chars) {
    if (outer.chars.has(char)) return false;
  }
  return true;
}

function unionSets(sets: CharSet[]): CharSet {
  const chars = new Set<string>();
  let excluded: Set<string> | null = null;

  for (const set of sets) {
    if (set.unknown) return UNKNOWN_SET;
    if (set.negated) {
      if (excluded === null) {
        excluded = new Set(set.chars);
      } else {
        for (const char of Array.from(excluded)) {
          if (!set.chars.has(char)) excluded.delete(char);
        }
      }
    } else {
      for (const char of set.chars) chars.add(char);
    }
  }

  if (excluded !== null) {
    for (const char of chars) excluded.delete(char);
    return { chars: excluded, negated: true, unknown: false };
  }

  return { chars, negated: false, unknown: false };
}

function matchesChar(set: CharSet, char: string): boolean {
  if (set.unknown) return true;
  return set.negated ? !set.chars.has(char) : set.chars.has(char);
}

function isBroad(set: CharSet): boolean {
  return set.unknown || set.negated || set.chars.size >= BROAD_SET_SIZE;
}

function runsPastTheNewline(set: CharSet): boolean {
  return isBroad(set) && matchesChar(set, "\n");
}

interface Atom {
  readonly set: CharSet;
  readonly repeats: boolean;
  readonly mandatory: boolean;
  readonly ambiguous?: boolean;
  readonly branchRepeat?: boolean;
  readonly weight: number;
}

interface Quantifier {
  readonly present: boolean;
  readonly unbounded: boolean;
  readonly optional: boolean;
  readonly exact: number;
  readonly bound: number;
}

const NO_QUANTIFIER: Quantifier = {
  present: false,
  unbounded: false,
  optional: false,
  exact: 0,
  bound: 0,
};

function quantifierWeight(quantifier: Quantifier): number {
  if (quantifier.unbounded) return LARGE_REPEAT_BOUND;
  if (quantifier.bound >= 2) {
    return Math.min(quantifier.bound, LARGE_REPEAT_BOUND);
  }
  return 1;
}

function branchSets(branches: Atom[][]): CharSet[] {
  const sets: CharSet[] = [];
  for (const branch of branches) {
    for (const atom of branch) sets.push(atom.set);
  }
  return sets;
}

function branchesMustConsume(branches: Atom[][]): boolean {
  return branches.every((branch) => branch.some((atom) => atom.mandatory));
}

function leadingSet(branch: Atom[]): { set: CharSet; empty: boolean } {
  const sets: CharSet[] = [];

  for (const atom of branch) {
    if (isEmptySet(atom.set)) continue;
    sets.push(atom.set);
    if (atom.mandatory) return { set: unionSets(sets), empty: false };
  }

  return { set: unionSets(sets), empty: true };
}

function branchesAmbiguous(branches: Atom[][]): boolean {
  const leading = branches.map(leadingSet);

  for (let left = 0; left < leading.length; left += 1) {
    if (leading[left].empty) return true;
    for (let right = left + 1; right < leading.length; right += 1) {
      if (!isEmptySet(intersect(leading[left].set, leading[right].set))) {
        return true;
      }
    }
  }

  return false;
}

interface ChainScore {
  readonly length: number;
  readonly weightProduct: number;
  readonly ungated: number;
  readonly ungatedUnstoppable: number;
  readonly pairedUnstoppable: number;
  readonly ambiguousAlternation: number;
  readonly branchRepeat: number;
  readonly expansionOverflow: number;
}

const EMPTY_CHAIN: ChainScore = {
  length: 0,
  weightProduct: 1,
  ungated: 0,
  ungatedUnstoppable: 0,
  pairedUnstoppable: 0,
  ambiguousAlternation: 0,
  branchRepeat: 0,
  expansionOverflow: 0,
};

const AMBIGUOUS_ALTERNATION_CHAIN: ChainScore = {
  ...EMPTY_CHAIN,
  ambiguousAlternation: 1,
};

const BRANCH_REPEAT_CHAIN: ChainScore = {
  ...EMPTY_CHAIN,
  branchRepeat: 1,
};

const EXPANSION_OVERFLOW_CHAIN: ChainScore = {
  ...EMPTY_CHAIN,
  expansionOverflow: 1,
};

function worstChain(left: ChainScore, right: ChainScore): ChainScore {
  return {
    length: Math.max(left.length, right.length),
    weightProduct: Math.max(left.weightProduct, right.weightProduct),
    ungated: Math.max(left.ungated, right.ungated),
    ungatedUnstoppable: Math.max(
      left.ungatedUnstoppable,
      right.ungatedUnstoppable,
    ),
    pairedUnstoppable: Math.max(
      left.pairedUnstoppable,
      right.pairedUnstoppable,
    ),
    ambiguousAlternation: Math.max(
      left.ambiguousAlternation,
      right.ambiguousAlternation,
    ),
    branchRepeat: Math.max(left.branchRepeat, right.branchRepeat),
    expansionOverflow: Math.max(
      left.expansionOverflow,
      right.expansionOverflow,
    ),
  };
}

function separatorsAbsorbed(
  atoms: Atom[],
  from: number,
  to: number,
  shared: CharSet,
): boolean {
  for (let index = from; index < to; index += 1) {
    const atom = atoms[index];
    if (!atom.mandatory) continue;
    if (isEmptySet(atom.set)) return false;
    if (!isSubsetOf(atom.set, shared)) return false;
  }
  return true;
}

function chainScore(atoms: Atom[], gatedAtStart: boolean): ChainScore {
  let best = EMPTY_CHAIN;

  const gatedBefore: boolean[] = [];
  let gated = gatedAtStart;
  for (const atom of atoms) {
    gatedBefore.push(gated);
    if (atom.mandatory) gated = true;
  }

  for (let start = 0; start < atoms.length; start += 1) {
    const first = atoms[start];
    if (!first.repeats) continue;

    const open = !gatedBefore[start];
    let run = 1;
    let unstoppable = runsPastTheNewline(first.set) ? 1 : 0;
    let shared = first.set;
    let previous = start;

    best = worstChain(best, {
      ...EMPTY_CHAIN,
      length: run,
      ungated: open ? run : 0,
      ungatedUnstoppable: open ? unstoppable : 0,
      pairedUnstoppable: run > 1 ? unstoppable : 0,
    });

    for (let next = start + 1; next < atoms.length; next += 1) {
      const atom = atoms[next];
      if (!atom.repeats) continue;

      const candidate = intersect(shared, atom.set);
      if (isEmptySet(candidate)) continue;
      if (!separatorsAbsorbed(atoms, previous + 1, next, candidate)) break;

      shared = candidate;
      previous = next;
      run += 1;
      if (runsPastTheNewline(atom.set)) unstoppable += 1;
      best = worstChain(best, {
        ...EMPTY_CHAIN,
        length: run,
        ungated: open ? run : 0,
        ungatedUnstoppable: open ? unstoppable : 0,
        pairedUnstoppable: run > 1 ? unstoppable : 0,
      });

      if (run > MAX_ADJACENT_QUANTIFIERS) break;
    }
  }

  for (let start = 0; start < atoms.length; start += 1) {
    const first = atoms[start];
    if (first.weight <= 1) continue;

    let product = first.weight;
    let shared = first.set;
    let previous = start;

    best = worstChain(best, { ...EMPTY_CHAIN, weightProduct: product });

    for (let next = start + 1; next < atoms.length; next += 1) {
      const atom = atoms[next];
      if (atom.weight <= 1) continue;

      const candidate = intersect(shared, atom.set);
      if (isEmptySet(candidate)) continue;
      if (!separatorsAbsorbed(atoms, previous + 1, next, candidate)) break;

      shared = candidate;
      previous = next;
      product *= atom.weight;
      best = worstChain(best, { ...EMPTY_CHAIN, weightProduct: product });

      if (product > MAX_WEIGHT_PRODUCT) break;
    }
  }

  return best;
}

function scoreQuantifierChains(pattern: string): ChainScore {
  let index = 0;
  let worst = EMPTY_CHAIN;

  const readQuantifier = (): Quantifier => {
    const char = pattern[index];

    if (char === "*" || char === "+" || char === "?") {
      index += 1;
      if (pattern[index] === "?") index += 1;
      return {
        present: true,
        unbounded: char !== "?",
        optional: char !== "+",
        exact: 0,
        bound: char === "?" ? 1 : 0,
      };
    }

    if (char === "{") {
      const range = /^\{(\d*)(,?)(\d*)\}/.exec(pattern.slice(index));
      if (!range) return NO_QUANTIFIER;
      index += range[0].length;
      if (pattern[index] === "?") index += 1;
      const [, min, comma, max] = range;
      return {
        present: true,
        unbounded:
          (comma === "," && max === "") ||
          (max !== "" && Number(max) >= LARGE_REPEAT_BOUND),
        optional: min === "" || Number(min) === 0,
        exact: comma === "" && min !== "" ? Number(min) : 0,
        bound: max === "" ? 0 : Number(max),
      };
    }

    return NO_QUANTIFIER;
  };

  const readClassItem = (): string | CharSet | null => {
    const char = pattern[index];
    if (char !== "\\") {
      index += 1;
      return char;
    }

    index += 1;
    const escaped = pattern[index];
    if (escaped === undefined) return null;
    index += 1;

    if (SHORTHAND_SETS[escaped]) return SHORTHAND_SETS[escaped];
    if (CONTROL_ESCAPES[escaped] !== undefined) return CONTROL_ESCAPES[escaped];

    if (escaped === "x" || escaped === "u" || escaped === "c") {
      const digits = /^(?:\{[0-9a-fA-F]+\}|[0-9a-fA-F]{1,4})/.exec(
        pattern.slice(index),
      );
      if (digits) index += digits[0].length;
      return null;
    }

    if (escaped === "p" || escaped === "P") {
      const property = /^\{[^}]*\}/.exec(pattern.slice(index));
      if (property) index += property[0].length;
      return null;
    }

    return escaped;
  };

  const readClass = (): CharSet => {
    index += 1;
    let negated = false;
    if (pattern[index] === "^") {
      negated = true;
      index += 1;
    }

    const chars = new Set<string>();
    let excluded: Set<string> | null = null;
    let unknown = false;
    let previous: string | null = null;

    while (index < pattern.length) {
      if (pattern[index] === "]") {
        index += 1;
        break;
      }

      if (
        pattern[index] === "-" &&
        previous !== null &&
        index + 1 < pattern.length &&
        pattern[index + 1] !== "]"
      ) {
        index += 1;
        const upper = readClassItem();
        if (typeof upper === "string") {
          const from = previous.charCodeAt(0);
          const to = upper.charCodeAt(0);
          for (let code = from; code <= to && code - from < 1024; code += 1) {
            chars.add(String.fromCharCode(code));
          }
        } else {
          unknown = true;
        }
        previous = null;
        continue;
      }

      const item = readClassItem();
      if (item === null) {
        unknown = true;
        previous = null;
      } else if (typeof item === "string") {
        chars.add(item);
        previous = item;
      } else {
        if (item.negated) {
          if (excluded === null) {
            excluded = new Set(item.chars);
          } else {
            for (const char of Array.from(excluded)) {
              if (!item.chars.has(char)) excluded.delete(char);
            }
          }
        } else {
          for (const char of item.chars) chars.add(char);
        }
        previous = null;
      }
    }

    if (excluded !== null) {
      for (const char of chars) excluded.delete(char);
      return { chars: excluded, negated: !negated, unknown };
    }

    return { chars, negated, unknown };
  };

  const readBranch = (gatedAtStart: boolean): Atom[] => {
    const atoms: Atom[] = [];

    while (index < pattern.length) {
      const char = pattern[index];
      if (char === "|" || char === ")") break;

      if (char === "(") {
        index += 1;
        const prefix = GROUP_PREFIX.exec(pattern.slice(index));
        const lookaround = !!prefix && LOOKAROUND_PREFIX.test(prefix[0]);
        if (prefix) index += prefix[0].length;

        const gatedHere = gatedAtStart || atoms.some((atom) => atom.mandatory);

        const branches: Atom[][] = [readBranch(gatedHere)];
        while (pattern[index] === "|") {
          index += 1;
          branches.push(readBranch(gatedHere));
        }
        if (pattern[index] === ")") index += 1;

        const quantifier = readQuantifier();
        const repeated = quantifier.unbounded || quantifier.exact >= 2;

        const ambiguousHere =
          branches.length > 1 && branchesAmbiguous(branches);
        const branchRepeatHere =
          branches.length > 1 &&
          branches.some((branch) => branch.some((atom) => atom.repeats));
        const carriesAmbiguous = branches.some((branch) =>
          branch.some((atom) => atom.ambiguous),
        );
        const carriesBranchRepeat = branches.some((branch) =>
          branch.some((atom) => atom.branchRepeat),
        );

        if (repeated && ambiguousHere) {
          worst = worstChain(worst, AMBIGUOUS_ALTERNATION_CHAIN);
        }
        if (repeated && branchRepeatHere) {
          worst = worstChain(worst, BRANCH_REPEAT_CHAIN);
        }

        if (lookaround) {
          atoms.push({
            set: EMPTY_SET,
            repeats: false,
            mandatory: false,
            weight: 1,
          });
        } else if (
          branches.length === 1 &&
          (!quantifier.present || quantifier.exact >= 1)
        ) {
          const copies =
            quantifier.exact >= 2
              ? Math.min(quantifier.exact, REPEAT_EXPANSION_CAP)
              : 1;
          if (copies >= 2) {
            if (carriesAmbiguous) {
              worst = worstChain(worst, AMBIGUOUS_ALTERNATION_CHAIN);
            }
            if (carriesBranchRepeat) {
              worst = worstChain(worst, BRANCH_REPEAT_CHAIN);
            }
          }
          let pushed = 0;
          while (pushed < copies && atoms.length < MAX_EXPANDED_ATOMS) {
            atoms.push(...branches[0]);
            pushed += 1;
          }
          if (pushed < copies) {
            worst = worstChain(worst, EXPANSION_OVERFLOW_CHAIN);
          }
        } else {
          for (const branch of branches) {
            worst = worstChain(worst, chainScore(branch, gatedHere));
          }

          atoms.push({
            set:
              branches.length === 1
                ? unionSets(branchSets(branches))
                : EMPTY_SET,
            repeats: quantifier.unbounded,
            mandatory: !quantifier.optional && branchesMustConsume(branches),
            ambiguous: ambiguousHere || carriesAmbiguous,
            branchRepeat: branchRepeatHere || carriesBranchRepeat,
            weight: quantifierWeight(quantifier),
          });
        }

        continue;
      }

      let set: CharSet;
      let startAnchor = false;

      if (char === "[") {
        set = readClass();
      } else if (char === ".") {
        index += 1;
        set = DOT_SET;
      } else if (char === "^") {
        index += 1;
        set = EMPTY_SET;
        startAnchor = true;
      } else if (char === "$") {
        index += 1;
        set = EMPTY_SET;
      } else if (char === "\\") {
        const escaped = pattern[index + 1];
        if (escaped === "b" || escaped === "B") {
          index += 2;
          set = EMPTY_SET;
        } else if (escaped !== undefined && /[1-9]/.test(escaped)) {
          index += 2;
          while (index < pattern.length && /\d/.test(pattern[index]))
            index += 1;
          set = UNKNOWN_SET;
        } else {
          const item = readClassItem();
          set =
            item === null
              ? UNKNOWN_SET
              : typeof item === "string"
                ? literalSet(item)
                : item;
        }
      } else {
        index += 1;
        set = literalSet(char);
      }

      const quantifier = readQuantifier();
      atoms.push({
        set,
        repeats: quantifier.unbounded,
        mandatory: startAnchor || (!quantifier.optional && !isEmptySet(set)),
        weight: quantifierWeight(quantifier),
      });
    }

    return atoms;
  };

  const branches: Atom[][] = [readBranch(false)];
  while (pattern[index] === "|") {
    index += 1;
    branches.push(readBranch(false));
  }

  for (const branch of branches) {
    worst = worstChain(worst, chainScore(branch, false));
  }

  return worst;
}

export function describeUnsafePattern(pattern: string): string | null {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return `longer than ${MAX_PATTERN_LENGTH} characters`;
  }

  for (const body of findQuantifiedGroups(pattern)) {
    if (containsQuantifier(body)) {
      return "has a quantifier nested inside a repeated group";
    }
    if (containsAlternation(body)) {
      return "has an alternation inside a repeated group";
    }
  }

  const chain = scoreQuantifierChains(pattern);
  if (chain.expansionOverflow > 0) {
    return "nests counted repetitions deeper than the check can expand";
  }
  if (chain.branchRepeat > 0) {
    return "has a quantifier nested inside a repeated group";
  }
  if (chain.ambiguousAlternation > MAX_AMBIGUOUS_ALTERNATION) {
    return "repeats an alternation whose branches can match the same text";
  }
  if (chain.length > MAX_ADJACENT_QUANTIFIERS) {
    return `chains more than ${MAX_ADJACENT_QUANTIFIERS} overlapping quantifiers`;
  }
  if (chain.weightProduct > MAX_WEIGHT_PRODUCT) {
    return `chains overlapping repetitions whose bounds multiply past ${MAX_WEIGHT_PRODUCT}`;
  }
  if (chain.ungated > MAX_UNGATED_QUANTIFIERS) {
    return "chains overlapping quantifiers with nothing that has to match before them";
  }
  if (chain.pairedUnstoppable > MAX_PAIRED_UNSTOPPABLE) {
    return "chains a repetition of a set that runs past the newline with another repetition";
  }
  if (chain.ungatedUnstoppable > MAX_UNGATED_UNSTOPPABLE) {
    return "repeats a set that runs past the newline with nothing that has to match before it";
  }

  return null;
}

const ALLOWED_MATCH_FLAGS = "im";
const ALLOWED_CULPRIT_FLAGS = "gim";

function describeUnsafeFlags(flags: string, culprit: boolean): string | null {
  const allowed = culprit ? ALLOWED_CULPRIT_FLAGS : ALLOWED_MATCH_FLAGS;
  const seen = new Set<string>();

  for (const flag of flags) {
    if (!allowed.includes(flag)) {
      return `uses the flag "${flag}"; only "${allowed}" are allowed here`;
    }
    if (seen.has(flag)) return `repeats the flag "${flag}"`;
    seen.add(flag);
  }

  if (culprit && flags !== "" && !seen.has("g")) {
    return 'is missing the "g" flag, without which culprit extraction never advances';
  }

  return null;
}

function isBoundedPattern(pattern: string): boolean {
  return describeUnsafePattern(pattern) === null;
}

function normalizeRulePriority(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CRASH_RULE_PRIORITY;
  }

  return Math.min(Math.max(Math.round(value), 0), MAX_CRASH_RULE_PRIORITY);
}

export function sanitizeCrashRules(rules: unknown): CrashRule[] {
  if (!Array.isArray(rules)) return [];

  return rules
    .filter((rule) => {
      if (!isValidRule(rule)) return false;

      try {
        if (rule.flags !== undefined) {
          if (typeof rule.flags !== "string") return false;
          if (describeUnsafeFlags(rule.flags, false)) return false;
        }
        if (rule.culpritFlags !== undefined) {
          if (typeof rule.culpritFlags !== "string") return false;
          if (describeUnsafeFlags(rule.culpritFlags, true)) return false;
        }
        if (rule.pattern) {
          if (!isBoundedPattern(rule.pattern)) return false;
          new RegExp(rule.pattern, rule.flags || "i");
        }
        if (rule.allPatterns) {
          if (
            !Array.isArray(rule.allPatterns) ||
            rule.allPatterns.length > MAX_PATTERNS_PER_RULE
          ) {
            return false;
          }
          for (const pattern of rule.allPatterns) {
            if (typeof pattern !== "string" || !isBoundedPattern(pattern)) {
              return false;
            }
            new RegExp(pattern, rule.flags || "i");
          }
        }
        if (rule.culpritPattern) {
          if (!isBoundedPattern(rule.culpritPattern)) return false;
          new RegExp(rule.culpritPattern, rule.culpritFlags || "gi");
        }
        return true;
      } catch {
        return false;
      }
    })
    .slice(0, MAX_REMOTE_RULES)
    .map((rule) => ({
      ...rule,
      priority: normalizeRulePriority(rule.priority),
    }));
}

export const MAX_CULPRITS = 5;

function extractCulprits(rule: CrashRule, text: string): string[] {
  if (!rule.culpritPattern || !text) return [];

  const culprits = new Set<string>();
  try {
    const culpritPattern = new RegExp(
      rule.culpritPattern,
      rule.culpritFlags || "gi",
    );
    let match: RegExpExecArray | null;
    while ((match = culpritPattern.exec(text)) && culprits.size < MAX_CULPRITS) {
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
  return redactSecrets(line)
    .replace(/[A-Za-z]:\\[^\s"']+/g, (match) => match.split(/[\\/]/).pop() || match)
    .replace(/\/(?:[^\s"'/]+\/)+([^\s"'/]+)/g, "$1")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "<ip>")
    .replace(/\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}\b/gi, "<ip>")
    .replace(/\b(?:[\w-]+\.)+[a-z]{2,}(?=:\d{2,5}\b)/gi, "<host>")
    .replace(
      /\b(?:for user|user|username|player|profile)\s+([\w.-]{3,16})/gi,
      (match, name: string) => match.slice(0, match.length - name.length) + "<user>",
    )
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

export interface CrashPattern {
  pattern: string;
  flags: string;
}

export type CrashPatternVerdict = (pattern: string, flags: string) => boolean;

export function crashPatternKey(pattern: string, flags: string): string {
  return `${flags}\u0000${pattern}`;
}

function rulePatternList(rule: CrashRule): string[] {
  if (rule.allPatterns?.length) return rule.allPatterns;
  return rule.pattern ? [rule.pattern] : [];
}

export function crashRulePatterns(rules: CrashRule[]): CrashPattern[] {
  const seen = new Set<string>();
  const patterns: CrashPattern[] = [];

  for (const rule of rules) {
    const flags = rule.flags ?? "i";
    for (const pattern of rulePatternList(rule)) {
      const key = crashPatternKey(pattern, flags);
      if (seen.has(key)) continue;
      seen.add(key);
      patterns.push({ pattern, flags });
    }
  }

  return patterns;
}

export function crashRuleCulpritPattern(rule: CrashRule): CrashPattern | null {
  if (!rule.culpritPattern) return null;
  return { pattern: rule.culpritPattern, flags: rule.culpritFlags || "gi" };
}

function isRuleMatched(
  rule: CrashRule,
  matched: CrashPatternVerdict,
  exitCode?: number,
): boolean {
  const flags = rule.flags ?? "i";
  const patterns = rulePatternList(rule);

  if (
    patterns.length &&
    patterns.every((pattern) => matched(pattern, flags))
  ) {
    return true;
  }

  return (
    typeof exitCode === "number" && rule.exitCodes?.includes(exitCode) === true
  );
}

export function selectCrashRule(
  rules: CrashRule[],
  matched: CrashPatternVerdict,
  exitCode?: number,
): CrashRule | null {
  let best: CrashRule | null = null;
  let bestPriority = -Infinity;

  for (const rule of rules) {
    const priority = rule.priority ?? DEFAULT_CRASH_RULE_PRIORITY;
    if (priority <= bestPriority) continue;
    if (!isRuleMatched(rule, matched, exitCode)) continue;

    best = rule;
    bestPriority = priority;
  }

  return best;
}

export function matchCrashRules(
  text: string,
  rules: CrashRule[] = BUILT_IN_CRASH_RULES,
  exitCode?: number,
): CrashMatch | null {
  const best = selectCrashRule(
    rules,
    (pattern, flags) => {
      if (!text) return false;
      try {
        return new RegExp(pattern, flags).test(text);
      } catch {
        return false;
      }
    },
    exitCode,
  );

  if (!best) return null;

  return {
    ruleId: best.id,
    messages: best.messages,
    culprits: extractCulprits(best, text),
  };
}
