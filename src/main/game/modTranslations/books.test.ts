import { describe, expect, it } from "vitest";
import {
  BookDoc,
  bookPackFiles,
  collectBookGroups,
  docOutputPath,
  docSegments,
  installedBookFormats,
  parseBookPath,
  planBookUnits,
  renderDoc,
} from "./books";
import { unitHash } from "./unitHash";

const HYDRATION = [
  "```json",
  "{",
  '  "title": "Hydration",',
  '  "icon": "minecraft:potion[minecraft:potion_contents={potion:\\"minecraft:purified_water\\"}]",',
  '  "category": "agedaddition:basics",',
  '  "ordinal": 2',
  "}",
  "```",
  "",
  "Hold right click while sneaking to drink from a water source.",
  "",
  ";;;;;",
  "",
  "**Purified Water Bottle**",
  "",
  "---",
  "",
  "First get some glass bottles, then cook them on a campfire.",
  "<recipe;dehydration:purified_water_bottle>",
  "Open quests with <keybind;key.questz.openquestscreen>.",
  "See [Temperature](^agedaddition:basics/temperature).",
  "",
].join("\n");

function lavender(path: string, text: string, part: BookDoc["part"] = "entries"): BookDoc {
  return { format: "lavender", namespace: "agedaddition", book: "guide_book", part, path, text };
}

describe("parseBookPath", () => {
  it("tells Lavender's root, language folders and Patchouli's locale apart", () => {
    expect(
      parseBookPath("assets/agedaddition/lavender/entries/guide_book/basics/hydration.md"),
    ).toEqual({
      format: "lavender",
      namespace: "agedaddition",
      book: "guide_book",
      part: "entries",
      path: "basics/hydration.md",
      locale: null,
    });
    expect(
      parseBookPath("assets/agedaddition/lavender/categories/guide_book/ru_ru/basics.md")
        ?.locale,
    ).toBe("ru_ru");
    expect(
      parseBookPath("assets/tome/patchouli_books/lexicon/en_us/entries/a/b.json"),
    ).toMatchObject({ format: "patchouli", part: "entries", path: "a/b.json", locale: "en_us" });
    expect(parseBookPath("assets/agedaddition/lavender/books/guide_book.json")).toBeNull();
    expect(
      parseBookPath("assets/tome/patchouli_books/lexicon/en_us/templates/t.json"),
    ).toBeNull();
  });
});

describe("Lavender pages", () => {
  const doc = lavender("basics/hydration.md", HYDRATION);

  it("cuts the title and the paragraphs, leaving markup lines alone", () => {
    expect(docSegments(doc)).toEqual({
      "entries/basics/hydration.md#title": "Hydration",
      "entries/basics/hydration.md#001":
        "Hold right click while sneaking to drink from a water source.",
      "entries/basics/hydration.md#002": "**Purified Water Bottle**",
      "entries/basics/hydration.md#003":
        "First get some glass bottles, then cook them on a campfire.",
      "entries/basics/hydration.md#004":
        "Open quests with <keybind;key.questz.openquestscreen>.\n" +
        "See [Temperature](^agedaddition:basics/temperature).",
    });
  });

  it("puts translations back without touching the meta, tags and page breaks", () => {
    const text = renderDoc(doc, {
      "entries/basics/hydration.md#title": "Жажда",
      "entries/basics/hydration.md#002": "**Очищенная вода в бутылке**",
      "entries/basics/hydration.md#004":
        "Квесты открываются на <keybind;key.questz.openquestscreen>.\n" +
        "См. [Температура](^agedaddition:basics/temperature).",
    })!;

    expect(text).toBe(
      HYDRATION.replace('"title": "Hydration"', '"title": "Жажда"')
        .replace("**Purified Water Bottle**", "**Очищенная вода в бутылке**")
        .replace(
          "Open quests with <keybind;key.questz.openquestscreen>.\nSee [Temperature](^agedaddition:basics/temperature).",
          "Квесты открываются на <keybind;key.questz.openquestscreen>.\nСм. [Температура](^agedaddition:basics/temperature).",
        ),
    );
    expect(text).toContain('"icon": "minecraft:potion[minecraft:potion_contents={potion:\\"minecraft:purified_water\\"}]"');
    expect(text).toContain("<recipe;dehydration:purified_water_bottle>");
  });

  it("writes nothing for a page without any translation", () => {
    expect(renderDoc(doc, {})).toBeNull();
  });

  it("goes where Lavender looks for the player's language", () => {
    expect(docOutputPath(doc, "ru_ru")).toBe(
      "assets/agedaddition/lavender/entries/guide_book/ru_ru/basics/hydration.md",
    );
    expect(docOutputPath(lavender("basics.md", "x", "categories"), "uk_ua")).toBe(
      "assets/agedaddition/lavender/categories/guide_book/uk_ua/basics.md",
    );
  });

  it("keeps Windows line breaks of the original", () => {
    const crlf = lavender("a.md", "First line.\r\n\r\n<item;minecraft:stone>\r\nSecond.");
    expect(renderDoc(crlf, { "entries/a.md#001": "Первая.", "entries/a.md#002": "Вторая." })).toBe(
      "Первая.\r\n\r\n<item;minecraft:stone>\r\nВторая.",
    );
  });
});

describe("Patchouli pages", () => {
  const entry: BookDoc = {
    format: "patchouli",
    namespace: "tome",
    book: "lexicon",
    part: "entries",
    path: "basics/mortar.json",
    text: JSON.stringify({
      name: "Mortar",
      icon: "tome:mortar",
      category: "tome:basics",
      pages: [
        "Grind $(item)Bones$() into $(l:basics/meal)meal$(/l).",
        { type: "patchouli:crafting", recipe: "tome:mortar", text: "Craft one." },
        { type: "patchouli:multiblock", name: "Altar", multiblock_id: "tome:altar" },
        { type: "patchouli:text", title: "tome.page.key", text: "Keep $(br) it." },
      ],
    }),
  };

  it("cuts names and page texts, skipping ids and lang keys", () => {
    expect(docSegments(entry)).toEqual({
      "entries/basics/mortar.json#name": "Mortar",
      "entries/basics/mortar.json#p001":
        "Grind $(item)Bones$() into $(l:basics/meal)meal$(/l).",
      "entries/basics/mortar.json#p002.text": "Craft one.",
      "entries/basics/mortar.json#p003.name": "Altar",
      "entries/basics/mortar.json#p004.text": "Keep $(br) it.",
    });
  });

  it("writes the translated entry into the language folder", () => {
    const text = renderDoc(entry, {
      "entries/basics/mortar.json#name": "Ступка",
      "entries/basics/mortar.json#p001":
        "Измельчите $(item)кости$() в $(l:basics/meal)муку$(/l).",
    })!;
    const json = JSON.parse(text);
    expect(json.name).toBe("Ступка");
    expect(json.pages[0]).toBe("Измельчите $(item)кости$() в $(l:basics/meal)муку$(/l).");
    expect(json.pages[1]).toEqual({
      type: "patchouli:crafting",
      recipe: "tome:mortar",
      text: "Craft one.",
    });
    expect(json.pages[3].title).toBe("tome.page.key");
    expect(docOutputPath(entry, "ru_ru")).toBe(
      "assets/tome/patchouli_books/lexicon/ru_ru/entries/basics/mortar.json",
    );
  });

  it("reads a category's name and description", () => {
    const category: BookDoc = {
      ...entry,
      part: "categories",
      path: "basics.json",
      text: '{"name":"Basics","description":"Where to $(thing)start$().","icon":"x"}',
    };
    expect(docSegments(category)).toEqual({
      "categories/basics.json#name": "Basics",
      "categories/basics.json#description": "Where to $(thing)start$().",
    });
  });
});

describe("book groups and units", () => {
  const water = lavender("basics/water.md", "Drink water.");
  const fire = lavender("basics/fire.md", "Make fire.");
  const patchouli: BookDoc = {
    format: "patchouli",
    namespace: "keys",
    book: "codex",
    part: "entries",
    path: "a.json",
    text: '{"name":"Some text"}',
  };

  it("skips pages translated anywhere and books whose text are lang keys", () => {
    const groups = collectBookGroups(
      [
        {
          books: [water, fire, patchouli],
          translatedDocs: ["lavender:agedaddition:guide_book:entries/basics/fire.md"],
          patchouliI18n: ["patchouli:keys:codex"],
          context: { name: "Aged Guide Book" },
        },
      ],
      new Set(),
    );

    expect(groups).toEqual([
      {
        key: "lavender:agedaddition:guide_book",
        format: "lavender",
        namespace: "agedaddition",
        book: "guide_book",
        context: { name: "Aged Guide Book" },
        docs: [water],
      },
    ]);
  });

  it("leaves out books of a format whose mod is not installed", () => {
    const groups = collectBookGroups(
      [{ books: [water, patchouli], translatedDocs: [], patchouliI18n: [] }],
      new Set(),
      installedBookFormats(["create", "lavender", "minecraft"]),
    );
    expect(groups.map((group) => group.key)).toEqual(["lavender:agedaddition:guide_book"]);
  });

  it("lets a later source replace a page of an earlier one", () => {
    const override = { ...water, text: "Drink purified water." };
    const [group] = collectBookGroups([
      { books: [water], translatedDocs: [], patchouliI18n: [] },
      { books: [override], translatedDocs: [], patchouliI18n: [] },
    ]);
    expect(group.docs).toEqual([override]);
  });

  it("turns a book into book units with stable hashes", () => {
    const groups = collectBookGroups([
      { books: [water, fire], translatedDocs: [], patchouliI18n: [], context: { name: "Aged" } },
    ]);
    const [unit] = planBookUnits(groups);
    const entries = {
      "entries/basics/fire.md#001": "Make fire.",
      "entries/basics/water.md#001": "Drink water.",
    };
    expect(unit).toEqual({
      hash: unitHash(entries),
      namespace: "agedaddition",
      book: "lavender:agedaddition:guide_book",
      entries,
      context: { name: "Aged" },
    });
  });

  it("builds pack files only for pages with a translation", () => {
    const groups = collectBookGroups([
      { books: [water, fire], translatedDocs: [], patchouliI18n: [] },
    ]);
    const files = bookPackFiles(
      groups,
      new Map([
        ["lavender:agedaddition:guide_book", { "entries/basics/water.md#001": "Пейте воду." }],
      ]),
      "ru_ru",
    );
    expect(files.map((file) => [file.name, file.data.toString("utf8")])).toEqual([
      [
        "assets/agedaddition/lavender/entries/guide_book/ru_ru/basics/water.md",
        "Пейте воду.",
      ],
    ]);
  });
});

describe("GuideME pages", () => {
  const PAGE = [
    "---",
    "navigation:",
    "  parent: ae2-mechanics/ae2-mechanics-index.md",
    "  title: ME Controller",
    "  icon: controller",
    "categories:",
    "- devices",
    "item_ids:",
    "- ae2:controller",
    "---",
    "",
    "# The Controller",
    "",
    "<BlockImage id=\"controller\" scale=\"4\" />",
    "",
    "The controller routes channels, see [channels](../channels.md).",
    "",
    "<GameScene zoom=\"4\"",
    "  interactive={true}>",
    "  <ImportStructure src=\"controller.snbt\" />",
    "</GameScene>",
    "",
    "```",
    "code is not text",
    "```",
    "",
    "- one cable",
    "- two cables",
  ].join("\n");

  it("finds pages of AE2 and of guides built by mods like Powah", () => {
    expect(parseBookPath("assets/ae2/ae2guide/items-blocks-machines/controller.md")).toMatchObject({
      format: "guideme",
      namespace: "ae2",
      book: "ae2guide",
      path: "items-blocks-machines/controller.md",
      locale: null,
    });
    expect(parseBookPath("assets/powah/guides/powah/book/_ru_ru/index.md")).toMatchObject({
      format: "guideme",
      book: "guides/powah/book",
      path: "index.md",
      locale: "ru_ru",
    });
  });

  it("translates the navigation title, headings and prose, nothing else", () => {
    const doc: BookDoc = { format: "guideme", namespace: "ae2", book: "ae2guide", part: "entries", path: "controller.md", text: PAGE };
    expect(Object.values(docSegments(doc))).toEqual([
      "ME Controller",
      "# The Controller",
      "The controller routes channels, see [channels](../channels.md).",
      "- one cable\n- two cables",
    ]);
    const keys = Object.keys(docSegments(doc));
    const text = renderDoc(doc, {
      [keys[0]]: "ME-контроллер",
      [keys[1]]: "# Контроллер",
    })!;
    expect(text).toContain('  title: "ME-контроллер"');
    expect(text).toContain("  parent: ae2-mechanics/ae2-mechanics-index.md");
    expect(text).toContain("# Контроллер");
    expect(text).toContain("code is not text");
    expect(docOutputPath(doc, "ru_ru")).toBe("assets/ae2/ae2guide/_ru_ru/controller.md");
  });
});
