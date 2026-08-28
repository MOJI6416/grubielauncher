import { app } from "electron";
import fs from "fs-extra";
import path from "path";
import {
  AGENT_CHAT_TITLE_MAX,
  AgentChatSummary,
  AgentStoredChat,
} from "@/types/Agent";
import { writeJsonAtomic } from "./atomicJson";

const MAX_CHATS = 200;
const MAX_TOMBSTONES = 500;

function getChatsDir(): string {
  return path.join(app.getPath("appData"), ".grubielauncher", "agent", "chats");
}

function getChatPath(chatId: string): string {
  return path.join(getChatsDir(), `${chatId}.json`);
}

function getTombstonesPath(): string {
  return path.join(
    app.getPath("appData"),
    ".grubielauncher",
    "agent",
    "deleted.json",
  );
}

export function isChatId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

function isMissingFileError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

function normalizeChat(value: any): AgentStoredChat | null {
  if (!value || typeof value !== "object") return null;
  if (!isChatId(value.id)) return null;

  return {
    id: value.id,
    title:
      typeof value.title === "string"
        ? value.title.slice(0, AGENT_CHAT_TITLE_MAX)
        : "",
    pinned: value.pinned === true,
    provider: typeof value.provider === "string" ? value.provider : null,
    model: typeof value.model === "string" ? value.model : null,
    messageCount: Number.isFinite(value.messageCount)
      ? Number(value.messageCount)
      : 0,
    createdAt: Number.isFinite(value.createdAt) ? Number(value.createdAt) : 0,
    updatedAt: Number.isFinite(value.updatedAt) ? Number(value.updatedAt) : 0,
    remoteId: typeof value.remoteId === "string" ? value.remoteId : null,
    syncedSeq: Number.isFinite(value.syncedSeq) ? Number(value.syncedSeq) : -1,
    messages: Array.isArray(value.messages) ? value.messages : [],
    timeline: Array.isArray(value.timeline) ? value.timeline : [],
  };
}

function toSummary(chat: AgentStoredChat): AgentChatSummary {
  return {
    id: chat.id,
    title: chat.title,
    pinned: chat.pinned,
    provider: chat.provider,
    model: chat.model,
    messageCount: chat.messageCount,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };
}

export async function readChat(
  chatId: string,
): Promise<AgentStoredChat | null> {
  if (!isChatId(chatId)) return null;

  try {
    return normalizeChat(await fs.readJSON(getChatPath(chatId), "utf-8"));
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

export async function listChats(): Promise<AgentChatSummary[]> {
  const dir = getChatsDir();

  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }

  const chats: AgentChatSummary[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;

    try {
      const chat = normalizeChat(
        await fs.readJSON(path.join(dir, file), "utf-8"),
      );
      if (chat) chats.push(toSummary(chat));
    } catch {}
  }

  return chats.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

export async function writeChat(chat: AgentStoredChat): Promise<boolean> {
  const normalized = normalizeChat(chat);
  if (!normalized) return false;

  await fs.ensureDir(getChatsDir());
  await writeJsonAtomic(getChatPath(normalized.id), normalized, {
    mode: 0o600,
  });

  return true;
}

export async function deleteChat(chatId: string): Promise<boolean> {
  if (!isChatId(chatId)) return false;

  try {
    await fs.remove(getChatPath(chatId));
    return true;
  } catch {
    return false;
  }
}

export async function listTombstones(): Promise<string[]> {
  try {
    const data = await fs.readJSON(getTombstonesPath(), "utf-8");
    return Array.isArray(data)
      ? data.filter(
          (item: unknown): item is string =>
            typeof item === "string" && item !== "",
        )
      : [];
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
}

async function writeTombstones(ids: string[]): Promise<void> {
  await fs.ensureDir(path.dirname(getTombstonesPath()));
  await writeJsonAtomic(getTombstonesPath(), ids.slice(-MAX_TOMBSTONES), {
    mode: 0o600,
  });
}

export async function addTombstone(remoteId: string): Promise<void> {
  const ids = await listTombstones();
  if (ids.includes(remoteId)) return;

  await writeTombstones([...ids, remoteId]);
}

export async function forgetTombstone(remoteId: string): Promise<boolean> {
  const ids = await listTombstones();
  if (!ids.includes(remoteId)) return false;

  await writeTombstones(ids.filter((id) => id !== remoteId));
  return true;
}

export async function pruneChats(): Promise<number> {
  const chats = await listChats();
  if (chats.length <= MAX_CHATS) return 0;

  const stale = chats.slice(MAX_CHATS).filter((chat) => !chat.pinned);
  for (const chat of stale) await deleteChat(chat.id);

  return stale.length;
}
