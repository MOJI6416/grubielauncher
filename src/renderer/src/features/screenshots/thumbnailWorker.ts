interface ThumbnailRequest {
  id: number;
  bytes: ArrayBuffer;
  width: number;
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ThumbnailRequest>) => void) | null;
  postMessage: (message: unknown) => void;
};

scope.onmessage = async (event) => {
  const { id, bytes, width } = event.data;

  try {
    const bitmap = await createImageBitmap(new Blob([bytes]), {
      resizeWidth: width,
      resizeQuality: "medium",
    });
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d context");
    context.drawImage(bitmap, 0, 0);
    const naturalRatio = bitmap.height / bitmap.width;
    bitmap.close();

    const blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: 0.82,
    });
    scope.postMessage({ id, blob, ratio: naturalRatio });
  } catch (error) {
    scope.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
