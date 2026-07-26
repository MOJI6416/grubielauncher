const TAG_STRING = 0x08;

function findStringTag(buffer: Buffer, tagName: string): number {
  const name = Buffer.from(tagName, "utf8");
  const header = Buffer.alloc(3 + name.length);
  header.writeUInt8(TAG_STRING, 0);
  header.writeUInt16BE(name.length, 1);
  name.copy(header, 3);

  return buffer.indexOf(header);
}

export function readNbtString(
  buffer: Buffer,
  tagName: string,
): string | null {
  const start = findStringTag(buffer, tagName);
  if (start === -1) return null;

  const valueLengthOffset = start + 3 + Buffer.byteLength(tagName, "utf8");
  if (valueLengthOffset + 2 > buffer.length) return null;

  const valueLength = buffer.readUInt16BE(valueLengthOffset);
  const valueStart = valueLengthOffset + 2;
  if (valueStart + valueLength > buffer.length) return null;

  return buffer.toString("utf8", valueStart, valueStart + valueLength);
}

export function patchNbtString(
  buffer: Buffer,
  tagName: string,
  value: string,
): Buffer | null {
  const start = findStringTag(buffer, tagName);
  if (start === -1) return null;

  const valueLengthOffset = start + 3 + Buffer.byteLength(tagName, "utf8");
  if (valueLengthOffset + 2 > buffer.length) return null;

  const oldLength = buffer.readUInt16BE(valueLengthOffset);
  const valueStart = valueLengthOffset + 2;
  if (valueStart + oldLength > buffer.length) return null;

  const encoded = Buffer.from(value, "utf8");
  if (encoded.length > 0xffff) return null;

  const length = Buffer.alloc(2);
  length.writeUInt16BE(encoded.length, 0);

  return Buffer.concat([
    buffer.subarray(0, valueLengthOffset),
    length,
    encoded,
    buffer.subarray(valueStart + oldLength),
  ]);
}
