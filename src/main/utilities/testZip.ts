import fs from "fs";
import path from "path";
import zlib from "zlib";
import { readEntryData, withArchive } from "./archiver";

const DOS_DATE_1980 = 0x21;
const UTF8_NAMES = 0x0800;

export class TestZip {
  private readonly entries: { name: string; data: Buffer }[] = [];

  addFile(name: string, data: Buffer): void {
    this.entries.push({ name, data });
  }

  toBuffer(): Buffer {
    const local: Buffer[] = [];
    const central: Buffer[] = [];
    let offset = 0;

    for (const { name, data } of this.entries) {
      const fileName = Buffer.from(name, "utf8");
      const isDirectory = name.endsWith("/");
      const stored = isDirectory || data.length === 0;
      const body = stored ? data : zlib.deflateRawSync(data);
      const method = stored ? 0 : 8;
      const crc = zlib.crc32(data);

      const header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(UTF8_NAMES, 6);
      header.writeUInt16LE(method, 8);
      header.writeUInt16LE(DOS_DATE_1980, 12);
      header.writeUInt32LE(crc, 14);
      header.writeUInt32LE(body.length, 18);
      header.writeUInt32LE(data.length, 22);
      header.writeUInt16LE(fileName.length, 26);
      local.push(header, fileName, body);

      const record = Buffer.alloc(46);
      record.writeUInt32LE(0x02014b50, 0);
      record.writeUInt16LE(20, 4);
      record.writeUInt16LE(20, 6);
      record.writeUInt16LE(UTF8_NAMES, 8);
      record.writeUInt16LE(method, 10);
      record.writeUInt16LE(DOS_DATE_1980, 14);
      record.writeUInt32LE(crc, 16);
      record.writeUInt32LE(body.length, 20);
      record.writeUInt32LE(data.length, 24);
      record.writeUInt16LE(fileName.length, 28);
      record.writeUInt32LE(isDirectory ? 0x10 : 0, 38);
      record.writeUInt32LE(offset, 42);
      central.push(record, fileName);

      offset += header.length + fileName.length + body.length;
    }

    const directory = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);

    return Buffer.concat([...local, directory, end]);
  }

  writeZip(target: string): void {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, this.toBuffer());
  }
}

export async function readTestZip(zipPath: string): Promise<Map<string, Buffer>> {
  return withArchive(
    zipPath,
    async (archive) => {
      const files = new Map<string, Buffer>();
      for (const entry of archive.getEntries()) {
        if (!entry.isDirectory) files.set(entry.entryName, await readEntryData(entry));
      }
      return files;
    },
    { maxArchiveBytes: 16 * 1024 * 1024 * 1024 },
  );
}
