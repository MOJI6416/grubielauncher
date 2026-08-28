const DATA_IMAGE = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/i;

export interface InlineImage {
  extension: "png" | "jpg" | "webp";
  base64: string;
}

export function parseInlineImage(image: string): InlineImage | null {
  const match = DATA_IMAGE.exec(image.trim());
  if (!match) return null;

  const format = match[1].toLowerCase();

  return {
    extension: format.startsWith("jp") ? "jpg" : (format as "png" | "webp"),
    base64: match[2],
  };
}
