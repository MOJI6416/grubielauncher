import axios from "axios";
import { inflateRawSync } from "zlib";

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN = 22;
const TAIL_BYTES = 65557 + 20;
const MAX_CENTRAL_BYTES = 16 * 1024 * 1024;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const LOCAL_SLACK = 1024;
const TIMEOUT_MS = 15000;

export interface RemoteZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

export type RangeReader = (start: number, end: number) => Promise<Buffer>;
export type TailReader = (length: number) => Promise<{ data: Buffer; total: number }>;

export class RangeUnsupportedError extends Error {
  constructor() {
    super("RANGE_UNSUPPORTED");
  }
}

function parseTotal(contentRange: unknown): number | null {
  if (typeof contentRange !== "string") return null;
  const match = /\/(\d+)\s*$/.exec(contentRange);
  return match ? Number(match[1]) : null;
}

export function httpRangeReaders(url: string): {
  readTail: TailReader;
  readRange: RangeReader;
} {
  const get = async (range: string, maxBytes: number) => {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: "arraybuffer",
      headers: { Range: range, "Accept-Encoding": "identity" },
      timeout: TIMEOUT_MS,
      maxRedirects: 5,
      maxContentLength: maxBytes,
      validateStatus: (status) => status === 206,
    });
    return {
      data: Buffer.from(response.data),
      total: parseTotal(response.headers["content-range"]),
    };
  };

  return {
    async readTail(length) {
      try {
        const { data, total } = await get(`bytes=-${length}`, length + 1024);
        if (total === null) throw new RangeUnsupportedError();
        return { data, total };
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 200) {
          throw new RangeUnsupportedError();
        }
        throw error;
      }
    },
    async readRange(start, end) {
      const { data } = await get(`bytes=${start}-${end}`, end - start + 1024);
      return data;
    },
  };
}

function readUInt64(buffer: Buffer, offset: number): number {
  return Number(buffer.readBigUInt64LE(offset));
}

function findEocd(tail: Buffer): number {
  for (let index = tail.length - EOCD_MIN; index >= 0; index--) {
    if (tail.readUInt32LE(index) === EOCD_SIGNATURE) return index;
  }
  return -1;
}

async function locateCentral(
  tail: Buffer,
  total: number,
  readRange: RangeReader,
): Promise<{ offset: number; size: number }> {
  const eocd = findEocd(tail);
  if (eocd < 0) throw new Error("ZIP_NO_EOCD");

  let size = tail.readUInt32LE(eocd + 12);
  let offset = tail.readUInt32LE(eocd + 16);

  if (size === 0xffffffff || offset === 0xffffffff || tail.readUInt16LE(eocd + 10) === 0xffff) {
    const locator = eocd - 20;
    if (locator < 0 || tail.readUInt32LE(locator) !== ZIP64_LOCATOR_SIGNATURE) {
      throw new Error("ZIP_NO_ZIP64_LOCATOR");
    }
    const recordOffset = readUInt64(tail, locator + 8);
    const tailStart = total - tail.length;
    const record =
      recordOffset >= tailStart
        ? tail.subarray(recordOffset - tailStart, recordOffset - tailStart + 56)
        : await readRange(recordOffset, recordOffset + 55);
    if (record.length < 56 || record.readUInt32LE(0) !== ZIP64_EOCD_SIGNATURE) {
      throw new Error("ZIP_BAD_ZIP64_RECORD");
    }
    size = readUInt64(record, 40);
    offset = readUInt64(record, 48);
  }

  return { offset, size };
}

export function parseCentralDirectory(buffer: Buffer): RemoteZipEntry[] {
  const entries: RemoteZipEntry[] = [];
  let position = 0;

  while (position + 46 <= buffer.length) {
    if (buffer.readUInt32LE(position) !== CENTRAL_SIGNATURE) break;

    const method = buffer.readUInt16LE(position + 10);
    let compressedSize = buffer.readUInt32LE(position + 20);
    let size = buffer.readUInt32LE(position + 24);
    const nameLength = buffer.readUInt16LE(position + 28);
    const extraLength = buffer.readUInt16LE(position + 30);
    const commentLength = buffer.readUInt16LE(position + 32);
    let localOffset = buffer.readUInt32LE(position + 42);
    const nameStart = position + 46;
    const name = buffer.toString("utf8", nameStart, nameStart + nameLength);

    let extra = nameStart + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = buffer.readUInt16LE(extra);
      const length = buffer.readUInt16LE(extra + 2);
      if (id === 0x0001) {
        let field = extra + 4;
        if (size === 0xffffffff && field + 8 <= extraEnd) {
          size = readUInt64(buffer, field);
          field += 8;
        }
        if (compressedSize === 0xffffffff && field + 8 <= extraEnd) {
          compressedSize = readUInt64(buffer, field);
          field += 8;
        }
        if (localOffset === 0xffffffff && field + 8 <= extraEnd) {
          localOffset = readUInt64(buffer, field);
        }
      }
      extra += 4 + length;
    }

    entries.push({ name, method, compressedSize, size, localOffset });
    position = extraEnd + commentLength;
  }

  return entries;
}

export async function readRemoteZipIndex(readers: {
  readTail: TailReader;
  readRange: RangeReader;
}): Promise<RemoteZipEntry[]> {
  const { data: tail, total } = await readers.readTail(TAIL_BYTES);
  const central = await locateCentral(tail, total, readers.readRange);
  if (central.size > MAX_CENTRAL_BYTES) throw new Error("ZIP_INDEX_TOO_LARGE");

  const tailStart = total - tail.length;
  const buffer =
    central.offset >= tailStart
      ? tail.subarray(central.offset - tailStart, central.offset - tailStart + central.size)
      : await readers.readRange(central.offset, central.offset + central.size - 1);

  return parseCentralDirectory(buffer);
}

export async function readRemoteZipEntry(
  readRange: RangeReader,
  entry: RemoteZipEntry,
): Promise<Buffer> {
  if (entry.size > MAX_ENTRY_BYTES || entry.compressedSize > MAX_ENTRY_BYTES) {
    throw new Error("ZIP_ENTRY_TOO_LARGE");
  }

  const guess = 30 + Buffer.byteLength(entry.name) + LOCAL_SLACK + entry.compressedSize;
  let chunk = await readRange(entry.localOffset, entry.localOffset + guess - 1);
  if (chunk.readUInt32LE(0) !== LOCAL_SIGNATURE) throw new Error("ZIP_BAD_LOCAL_HEADER");

  const dataStart = 30 + chunk.readUInt16LE(26) + chunk.readUInt16LE(28);
  const dataEnd = dataStart + entry.compressedSize;
  if (chunk.length < dataEnd) {
    chunk = await readRange(entry.localOffset, entry.localOffset + dataEnd - 1);
  }

  const data = chunk.subarray(dataStart, dataEnd);
  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) return inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES });
  throw new Error("ZIP_UNSUPPORTED_METHOD");
}
