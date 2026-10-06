const IMAGE_FILE_PATTERN = /\.(apng|gif|jpe?g|png|webp)$/i;

export const MAX_PENDING_IMAGES = 10;
export const MAX_CHAT_IMAGE_BYTES = 16 * 1024 * 1024;

export function isChatImageFile(file: Pick<File, "type" | "name">): boolean {
  return file.type.startsWith("image/") || IMAGE_FILE_PATTERN.test(file.name);
}

export interface AttachmentPick<T> {
  accepted: T[];
  notImage: number;
  tooLarge: number;
  overflow: number;
}

export function pickChatImages<T extends Pick<File, "type" | "name" | "size">>(
  files: T[],
  alreadyPending: number,
): AttachmentPick<T> {
  const room = Math.max(0, MAX_PENDING_IMAGES - alreadyPending);
  const pick: AttachmentPick<T> = {
    accepted: [],
    notImage: 0,
    tooLarge: 0,
    overflow: 0,
  };

  for (const file of files) {
    if (!isChatImageFile(file)) pick.notImage += 1;
    else if (file.size > MAX_CHAT_IMAGE_BYTES) pick.tooLarge += 1;
    else if (pick.accepted.length >= room) pick.overflow += 1;
    else pick.accepted.push(file);
  }

  return pick;
}
