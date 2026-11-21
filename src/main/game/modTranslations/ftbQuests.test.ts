import { describe, expect, it } from "vitest";
import {
  FTB_QUESTS_BOOK,
  mergeQuestLang,
  parseQuestLang,
  planQuestUnits,
  questSegments,
  renderQuestLang,
} from "./ftbQuests";
import { unitHash } from "./unitHash";

const EN_US = `{
\tchapter.4A3B2C1D0E9F8A7B.title: "Getting Started"
\tquest.0123456789ABCDEF.quest_desc: [
\t\t"Welcome to &aAll the Mods&r!"
\t\t""
\t\t"{@pagebreak}"
\t\t"Chop a \\"tree\\" first."
\t\t"{image:atm:textures/quests/logo.png width:100 height:50 align:center}"
\t]
\tquest.0123456789ABCDEF.title: "Wood"
\t"quest.FEDCBA9876543210.quest_subtitle": "Find %s"
\ttask.1111111111111111.title: "minecraft:oak_log"
}
`;

describe("FTB Quests lang files", () => {
  it("reads FTB's SNBT with bare and quoted keys and string lists", () => {
    expect(parseQuestLang(EN_US)).toEqual({
      "chapter.4A3B2C1D0E9F8A7B.title": "Getting Started",
      "quest.0123456789ABCDEF.quest_desc": [
        "Welcome to &aAll the Mods&r!",
        "",
        "{@pagebreak}",
        'Chop a "tree" first.',
        "{image:atm:textures/quests/logo.png width:100 height:50 align:center}",
      ],
      "quest.0123456789ABCDEF.title": "Wood",
      "quest.FEDCBA9876543210.quest_subtitle": "Find %s",
      "task.1111111111111111.title": "minecraft:oak_log",
    });
    expect(parseQuestLang("{ broken: [")).toBeNull();
  });

  it("cuts titles and description lines, leaving page breaks, images and ids", () => {
    expect(questSegments(EN_US)).toEqual({
      "chapter.4A3B2C1D0E9F8A7B.title": "Getting Started",
      "quest.0123456789ABCDEF.quest_desc#001": "Welcome to &aAll the Mods&r!",
      "quest.0123456789ABCDEF.quest_desc#004": 'Chop a "tree" first.',
      "quest.0123456789ABCDEF.title": "Wood",
      "quest.FEDCBA9876543210.quest_subtitle": "Find %s",
    });
  });

  it("writes only translated keys, whole lists with untouched lines kept", () => {
    const text = renderQuestLang(EN_US, {
      "quest.0123456789ABCDEF.title": "Древесина",
      "quest.0123456789ABCDEF.quest_desc#004": "Сначала срубите «дерево».",
    })!;

    expect(parseQuestLang(text)).toEqual({
      "quest.0123456789ABCDEF.quest_desc": [
        "Welcome to &aAll the Mods&r!",
        "",
        "{@pagebreak}",
        "Сначала срубите «дерево».",
        "{image:atm:textures/quests/logo.png width:100 height:50 align:center}",
      ],
      "quest.0123456789ABCDEF.title": "Древесина",
    });
    expect(renderQuestLang(EN_US, {})).toBeNull();
  });

  it("turns the file into book units of the quest book", () => {
    const [unit] = planQuestUnits(EN_US);
    expect(unit.book).toBe(FTB_QUESTS_BOOK);
    expect(unit.namespace).toBe("ftbquests");
    expect(unit.hash).toBe(unitHash(questSegments(EN_US)));
    expect(unit.context.name).toBe("FTB Quests");
  });

  it("merges a flat file with Quests Lang Splitter's per-chapter files, later files winning", () => {
    const merged = mergeQuestLang([
      '{ quest.AAAAAAAAAAAAAAAA.title: "Old" quest.BBBBBBBBBBBBBBBB.title: "Kept" }',
      '{ quest.AAAAAAAAAAAAAAAA.title: "New" quest.CCCCCCCCCCCCCCCC.quest_desc: ["Line"] }',
    ]);
    expect(parseQuestLang(merged!)).toEqual({
      "quest.AAAAAAAAAAAAAAAA.title": "New",
      "quest.BBBBBBBBBBBBBBBB.title": "Kept",
      "quest.CCCCCCCCCCCCCCCC.quest_desc": ["Line"],
    });
  });
});
