import { describe, expect, it } from "vitest";
import {
  foxLoaderJarVersion,
  foxLoaderMavenVersion,
  listFoxLoaderVersions,
  replacesClientJar,
} from "./foxLoader";

const RELEASES = "https://github.com/Fox2Code/FoxLoader/releases/download";

function release(tag: string, ...files: string[]) {
  return {
    tag_name: tag,
    draft: false,
    assets: files.map((name) => ({
      name,
      browser_download_url: `${RELEASES}/${tag}/${name}`,
    })),
  };
}

describe("listFoxLoaderVersions", () => {
  it("takes the client jar under either name and keeps the release order", () => {
    expect(
      listFoxLoaderVersions([
        release(
          "2.0-alpha40",
          "foxloader-2.0-alpha40-mmc.zip",
          "foxloader-2.0-alpha40-server.jar",
          "foxloader-2.0-alpha40.jar",
        ),
        release(
          "2.0-alpha39",
          "foxloader-2.0-alpha39-installer.jar",
          "foxloader-2.0-alpha39-server.jar",
        ),
      ]),
    ).toEqual([
      {
        id: "2.0-alpha40",
        url: `${RELEASES}/2.0-alpha40/foxloader-2.0-alpha40.jar`,
      },
      {
        id: "2.0-alpha39",
        url: `${RELEASES}/2.0-alpha39/foxloader-2.0-alpha39-installer.jar`,
      },
    ]);
  });

  it("skips drafts, releases without a client jar and the ReIndev 2.8 line", () => {
    expect(
      listFoxLoaderVersions([
        { ...release("2.0-alpha41", "foxloader-2.0-alpha41.jar"), draft: true },
        release("2.0-alpha24", "foxloader-2.0-alpha24-server.jar"),
        release("1.3.3", "FoxLoader-1.3.3-installer.jar"),
      ]),
    ).toEqual([]);
    expect(listFoxLoaderVersions(null)).toEqual([]);
  });

  it("refuses a jar that lives outside the FoxLoader releases", () => {
    expect(
      listFoxLoaderVersions([
        {
          tag_name: "2.0-alpha40",
          assets: [
            {
              name: "foxloader-2.0-alpha40.jar",
              browser_download_url:
                "https://github.com/someone/FoxLoader/releases/download/2.0-alpha40/foxloader-2.0-alpha40.jar",
            },
          ],
        },
      ]),
    ).toEqual([]);
  });
});

describe("foxLoaderJarVersion", () => {
  it("reads the version from a release or maven address", () => {
    expect(
      foxLoaderJarVersion(`${RELEASES}/2.0-alpha40/foxloader-2.0-alpha40.jar`),
    ).toBe("2.0-alpha40");
    expect(
      foxLoaderJarVersion(
        "https://cdn.fox2code.com/maven/com/fox2code/FoxLoader/loader/2.0-alpha40/loader-2.0-alpha40.jar",
      ),
    ).toBe("2.0-alpha40");
  });

  it("rejects anything else", () => {
    expect(foxLoaderJarVersion("https://example.com/foxloader-2.0.jar")).toBeNull();
    expect(
      foxLoaderJarVersion(`${RELEASES}/2.0-alpha40/foxloader-2.0-alpha40-mmc.zip`),
    ).toBeNull();
    expect(
      foxLoaderJarVersion(`${RELEASES}/2.0-alpha40/../../../evil/x.jar`),
    ).toBeNull();
    expect(
      foxLoaderJarVersion(
        "https://cdn.fox2code.com/maven/com/fox2code/FoxLoader/loader/2.0-alpha40/loader-2.0-alpha39.jar",
      ),
    ).toBeNull();
    expect(foxLoaderJarVersion(undefined)).toBeNull();
  });
});

describe("foxLoaderMavenVersion", () => {
  it("offers the latest maven release when GitHub is out of reach", () => {
    expect(
      foxLoaderMavenVersion(
        "<metadata><versioning><release>2.0-alpha40</release></versioning></metadata>",
      ),
    ).toEqual({
      id: "2.0-alpha40",
      url: "https://cdn.fox2code.com/maven/com/fox2code/FoxLoader/loader/2.0-alpha40/loader-2.0-alpha40.jar",
    });
    expect(foxLoaderMavenVersion("<metadata></metadata>")).toBeNull();
    expect(foxLoaderMavenVersion(null)).toBeNull();
  });
});

describe("replacesClientJar", () => {
  it("marks the loaders whose game jar belongs to the loader build", () => {
    expect(replacesClientJar("foxloader")).toBe(true);
    expect(replacesClientJar("bta-babric")).toBe(true);
    expect(replacesClientJar("babric")).toBe(false);
    expect(replacesClientJar("vanilla")).toBe(false);
  });
});
