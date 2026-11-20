import { describe, expect, it } from "vitest";
import {
  forgeFit,
  isOptiFineChoice,
  optifineAdPageUrl,
  optifineBuildsFor,
  optifineOffer,
  parseOptiFineDownloads,
  parseOptiFineFile,
  pickOptiFineBuild,
  readOptiFineVersion,
  supportsOptiFine,
} from "./optifine";

const row = (
  kind: string,
  file: string,
  forge: string,
  date: string,
) => `<tr class='downloadLine downloadLine${kind}'>
  <td class='colFile'>OptiFine ${file}</td>
  <td class='colDownload'><a href="http://adfoc.us/serve/sitelinks/?id=475250&url=http://optifine.net/adloadx?f=${file}&x=3552">Download</a></td>
  <td class='colMirror'><a href="http://optifine.net/adloadx?f=${file}">(Mirror)</a></td>
  <td class='colChangelog'><a href='changelog?f=${file}'>Changelog</a></td>
  <td class='colForge'>${forge}</td>
  <td class='colDate'>${date}</td>
</tr>`;

const PAGE = [
  "<h2>Minecraft 1.16.5</h2>",
  row("Preview", "preview_OptiFine_1.16.5_HD_U_G9_pre1.jar", "Forge 36.2.0", "01.01.2022"),
  row("Main", "OptiFine_1.16.5_HD_U_G8.jar", "Forge 36.1.0", "07.04.2021"),
  row("More", "OptiFine_1.16.5_HD_U_G6.jar", "Forge 36.0.0", "20.01.2021"),
  "<h2>Minecraft 1.14.4</h2>",
  row("Main", "OptiFine_1.14.4_HD_U_F3.jar", "Forge N/A", "19.08.2019"),
  "<h2>Minecraft 1.12.2</h2>",
  row("Main", "OptiFine_1.12.2_HD_U_G5.jar", "Forge #2847", "24.01.2021"),
  row("More", "OptiFine_1.12.2_HD_U_E3.jar", "Forge #2795", "10.12.2018"),
  "<h2>Minecraft 1.8.0</h2>",
  row("Main", "OptiFine_1.8.0_HD_U_I7.jar", "Forge #1577", "02.05.2020"),
].join("\n");

describe("parseOptiFineDownloads", () => {
  it("reads stable builds from the official downloads page and skips previews", () => {
    const builds = parseOptiFineDownloads(PAGE);

    expect(builds.map((build) => build.file)).toEqual([
      "OptiFine_1.16.5_HD_U_G8.jar",
      "OptiFine_1.16.5_HD_U_G6.jar",
      "OptiFine_1.14.4_HD_U_F3.jar",
      "OptiFine_1.12.2_HD_U_G5.jar",
      "OptiFine_1.12.2_HD_U_E3.jar",
      "OptiFine_1.8.0_HD_U_I7.jar",
    ]);
    expect(builds[0]).toEqual({
      file: "OptiFine_1.16.5_HD_U_G8.jar",
      minecraft: "1.16.5",
      edition: "HD_U_G8",
      forge: "36.1.0",
      date: "2021-04-07",
    });
    expect(builds[2].forge).toBeNull();
    expect(builds[3].forge).toBe("#2847");
    expect(builds[5].minecraft).toBe("1.8");
  });

  it("returns nothing for a page without download rows", () => {
    expect(parseOptiFineDownloads("<html>maintenance</html>")).toEqual([]);
  });
});

describe("version range", () => {
  it("offers OptiFine only for vanilla and Forge from 1.7.2 to 1.16.5", () => {
    expect(supportsOptiFine("1.7.2")).toBe(true);
    expect(supportsOptiFine("1.16.5")).toBe(true);
    expect(supportsOptiFine("1.7.1")).toBe(false);
    expect(supportsOptiFine("1.17")).toBe(false);
    expect(supportsOptiFine("20w14a")).toBe(false);

    expect(optifineOffer("1.12.2", "vanilla")).toBe("optifine");
    expect(optifineOffer("1.12.2", "forge")).toBe("optifine");
    expect(optifineOffer("1.12.2", "fabric")).toBeNull();
    expect(optifineOffer("1.20.1", "forge")).toBe("sodium");
    expect(optifineOffer("26.1", "vanilla")).toBe("sodium");
    expect(optifineOffer("1.6.4", "vanilla")).toBeNull();
    expect(optifineOffer("b1.7.3", "vanilla")).toBeNull();
  });
});

describe("Forge compatibility", () => {
  const builds = parseOptiFineDownloads(PAGE);

  it("compares legacy build numbers and modern Forge versions", () => {
    expect(forgeFit({ forge: "#2847" }, "14.23.5.2860")).toBe("ok");
    expect(forgeFit({ forge: "#2847" }, "14.23.5.2768")).toBe("older");
    expect(forgeFit({ forge: "#1614" }, "10.13.4.1614-1.7.10")).toBe("ok");
    expect(forgeFit({ forge: "36.1.0" }, "36.2.39")).toBe("ok");
    expect(forgeFit({ forge: "36.1.0" }, "36.0.42")).toBe("older");
    expect(forgeFit({ forge: null }, "28.2.23")).toBe("unsupported");
  });

  it("hides builds without Forge support from Forge instances", () => {
    expect(optifineBuildsFor(builds, "1.14.4", "forge")).toEqual([]);
    expect(optifineBuildsFor(builds, "1.14.4", "vanilla")).toHaveLength(1);
  });

  it("prefers the newest build the installed Forge can run", () => {
    const list = optifineBuildsFor(builds, "1.16.5", "forge");
    expect(pickOptiFineBuild(list, "forge", "36.0.42")?.edition).toBe("HD_U_G6");
    expect(pickOptiFineBuild(list, "forge", "36.2.39")?.edition).toBe("HD_U_G8");
    expect(pickOptiFineBuild(list, "vanilla")?.edition).toBe("HD_U_G8");
  });
});

describe("files", () => {
  it("parses official file names only", () => {
    expect(parseOptiFineFile("OptiFine_1.12.2_HD_U_G5.jar")).toEqual({
      minecraft: "1.12.2",
      edition: "HD_U_G5",
    });
    expect(parseOptiFineFile("preview_OptiFine_1.12.2_HD_U_G6_pre1.jar")).toBeNull();
    expect(parseOptiFineFile("../OptiFine_1.12.2_HD_U_G5.jar")).toBeNull();
  });

  it("builds the official download page link", () => {
    expect(optifineAdPageUrl("OptiFine_1.12.2_HD_U_G5.jar")).toBe(
      "https://optifine.net/adloadx?f=OptiFine_1.12.2_HD_U_G5.jar",
    );
  });

  it("reads the version string from Config.class bytes", () => {
    const bytes = new TextEncoder().encode(
      "\u0000\u0001junkOptiFine_1.9.0_HD_U_I5\u0000more",
    );
    expect(readOptiFineVersion(bytes)).toEqual({
      minecraft: "1.9",
      raw: "1.9.0",
      edition: "HD_U_I5",
    });
    expect(readOptiFineVersion(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("validates a stored choice", () => {
    expect(
      isOptiFineChoice({
        file: "OptiFine_1.12.2_HD_U_G5.jar",
        minecraft: "1.12.2",
        edition: "HD_U_G5",
      }),
    ).toBe(true);
    expect(
      isOptiFineChoice({
        file: "OptiFine_1.12.2_HD_U_G5.jar",
        minecraft: "1.16.5",
        edition: "HD_U_G5",
      }),
    ).toBe(false);
  });
});
