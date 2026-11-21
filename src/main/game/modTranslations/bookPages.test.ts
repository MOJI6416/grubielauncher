import { describe, expect, it } from "vitest";
import { splitBookPage } from "./bookPages";

const COBBLEVERSE_TITLE =
  "    %1$s%2$s\n    от %3$s& %4$s\n\nЕсли нужна помощь, присоединяйтесь к нашему %5$s\n\nЧтобы быть в курсе новостей, подписывайтесь на нас в %6$s и %7$s\n\nВсе остальные соцсети — %8$s\n ";
const COBBLEVERSE_ARGS: Record<number, string> = {
  1: "COBBLE",
  2: "VERSE",
  3: "EL ",
  4: "MARY",
  5: "[Discord]",
  6: "[Modrinth]",
  7: "[CurseForge]",
  8: "[нажмите здесь]",
};

const placeholders = (text: string) => text.match(/%\d+\$s/g) ?? [];

describe("splitBookPage", () => {
  it("leaves a page that fits alone", () => {
    expect(splitBookPage("Короткая страница %1$s.", () => "[ссылка]")).toEqual([
      "Короткая страница %1$s.",
    ]);
  });

  it("moves the last paragraph of the COBBLEVERSE title page to the next page", () => {
    const chunks = splitBookPage(COBBLEVERSE_TITLE, (index) => COBBLEVERSE_ARGS[index]);
    expect(chunks).toEqual([
      "    %1$s%2$s\n    от %3$s& %4$s\n\nЕсли нужна помощь, присоединяйтесь к нашему %5$s\n\nЧтобы быть в курсе новостей, подписывайтесь на нас в %6$s и %7$s",
      "Все остальные соцсети — %8$s\n ",
    ]);
  });

  it("breaks long prose after a sentence, keeps every placeholder whole and each part fits", () => {
    const sentence =
      "Поставьте витрину рядом с торговцем и положите в неё %1$s, чтобы покупатели видели товар. ";
    const text = sentence.repeat(6).trim();
    const arg = () => "[изумруды]";
    const chunks = splitBookPage(text, arg);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].endsWith(".")).toBe(true);
    expect(chunks.flatMap(placeholders)).toEqual(placeholders(text));
    for (const chunk of chunks) expect(splitBookPage(chunk, arg)).toEqual([chunk]);
    expect(chunks.join(" ")).toBe(text);
  });

  it("counts explicit lines and never cuts %% or a placeholder", () => {
    const lines = Array.from({ length: 20 }, (_, index) => `Строка ${index + 1} — 100%%`);
    const chunks = splitBookPage(lines.join("\n"), () => undefined);
    expect(chunks[0].split("\n")).toHaveLength(14);
    expect(chunks[1].startsWith("Строка 15")).toBe(true);
    expect(chunks.every((chunk) => !/(^|[^%])%$/.test(chunk))).toBe(true);

    const wide = splitBookPage(`${"слово ".repeat(60)}%1$s`, () => "очень длинная ссылка ".repeat(8));
    expect(wide.at(-1)).toBe("%1$s");
  });
});
