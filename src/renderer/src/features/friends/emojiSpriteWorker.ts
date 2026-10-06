import type { EmojiSpriteRequest } from "./emojiSprite";

self.addEventListener("message", async (event: MessageEvent<EmojiSpriteRequest>) => {
  const { emoji, columns, cell, glyph, scale, font } = event.data;

  try {
    const rows = Math.ceil(emoji.length / columns);
    const canvas = new OffscreenCanvas(columns * cell * scale, rows * cell * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      self.postMessage(null);
      return;
    }

    context.scale(scale, scale);
    context.font = `${glyph}px ${font}`;
    context.textAlign = "center";
    context.textBaseline = "alphabetic";

    emoji.forEach((item, index) => {
      const metrics = context.measureText(item);
      const height = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
      const x = (index % columns) * cell + cell / 2;
      const y =
        Math.floor(index / columns) * cell +
        (cell - height) / 2 +
        metrics.actualBoundingBoxAscent;
      context.fillText(item, x, y);
    });

    self.postMessage(await canvas.convertToBlob({ type: "image/png" }));
  } catch {
    self.postMessage(null);
  }
});
