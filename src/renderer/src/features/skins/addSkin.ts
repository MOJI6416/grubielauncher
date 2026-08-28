import { SkinTextureProblem } from "./skinTexture";

export type AddSkinSource = "file" | "link" | "nick";
export type AddSkinType = "skin" | "cape";

export type AddSkinPreviewError =
  | SkinTextureProblem
  | "unreadable"
  | "unreachable"
  | "badLink";

export function addSkinSources(type: AddSkinType): AddSkinSource[] {
  return type === "cape" ? ["file", "link"] : ["file", "link", "nick"];
}

export function isLikelyTextureLink(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  try {
    const url = new URL(trimmed);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isNicknameValid(value: string): boolean {
  return /^[A-Za-z0-9_]{3,16}$/.test(value.trim());
}
