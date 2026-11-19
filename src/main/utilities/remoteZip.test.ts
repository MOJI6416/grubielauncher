import { describe, expect, it } from "vitest";
import { TestZip } from "./testZip";
import {
  readRemoteZipEntry,
  readRemoteZipIndex,
  type RangeReader,
  type TailReader,
} from "./remoteZip";

function rangeReaders(archive: Buffer) {
  const requests: string[] = [];
  const readTail: TailReader = async (length) => {
    requests.push(`tail:${length}`);
    return { data: archive.subarray(Math.max(0, archive.length - length)), total: archive.length };
  };
  const readRange: RangeReader = async (start, end) => {
    requests.push(`${start}-${end}`);
    return archive.subarray(start, Math.min(archive.length, end + 1));
  };
  return { readTail, readRange, requests };
}

function packArchive(manifest: unknown, overrides: number) {
  const zip = new TestZip();
  zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest)));
  zip.addFile("modlist.html", Buffer.from("<ul></ul>"));
  for (let index = 0; index < overrides; index++) {
    zip.addFile(
      `overrides/config/file-${index}.toml`,
      Buffer.from(`value=${index}\n`.repeat(200)),
    );
  }
  return zip.toBuffer();
}

describe("readRemoteZipIndex", () => {
  it("lists entries from the tail of a small archive in one request", async () => {
    const archive = packArchive({ files: [] }, 3);
    const readers = rangeReaders(archive);

    const entries = await readRemoteZipIndex(readers);

    expect(entries.map((entry) => entry.name)).toEqual([
      "manifest.json",
      "modlist.html",
      "overrides/config/file-0.toml",
      "overrides/config/file-1.toml",
      "overrides/config/file-2.toml",
    ]);
    expect(readers.requests).toHaveLength(1);
  });

  it("asks for the central directory separately when it is far from the end", async () => {
    const zip = new TestZip();
    zip.addFile("manifest.json", Buffer.from("{}"));
    for (let index = 0; index < 1200; index++) {
      zip.addFile(`overrides/config/a-very-long-folder-name/${index}.json`, Buffer.from("{}"));
    }
    const archive = zip.toBuffer();
    const readers = rangeReaders(archive);

    const entries = await readRemoteZipIndex(readers);

    expect(entries).toHaveLength(1201);
    expect(readers.requests.length).toBe(2);
  });
});

describe("readRemoteZipEntry", () => {
  it("inflates one entry without reading the rest of the archive", async () => {
    const manifest = { files: [{ projectID: 1, fileID: 2, required: false }] };
    const archive = packArchive(manifest, 40);
    const readers = rangeReaders(archive);
    const entries = await readRemoteZipIndex(readers);
    const entry = entries.find((item) => item.name === "manifest.json")!;

    const data = await readRemoteZipEntry(readers.readRange, entry);

    expect(JSON.parse(data.toString("utf8"))).toEqual(manifest);
    const read = readers.requests
      .filter((request) => !request.startsWith("tail"))
      .map((request) => request.split("-").map(Number))
      .reduce((sum, [start, end]) => sum + end - start + 1, 0);
    expect(read).toBeLessThan(archive.length / 4);
  });
});
