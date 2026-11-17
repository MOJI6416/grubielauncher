import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import {
  CloudOff,
  Ellipsis,
  MessagesSquare,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Hint } from "@renderer/components/Hint";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { RemovalItem, RemovalList } from "@renderer/components/RemovalCollapse";
import { showFailureToast } from "@renderer/utilities/failures";
import {
  deleteChat,
  renameChat,
  syncChats,
  togglePinned,
} from "@renderer/agent/history";
import { leaveRunningChat } from "@renderer/agent/loop";
import {
  agentChatsAtom,
  agentCurrentChatAtom,
  agentSyncFailedAtom,
} from "@renderer/agent/store";
import type { AgentChatSummary } from "@/types/Agent";
import { filterChats, groupChats } from "./chatGroups";

function ChatMenuItems({
  menu,
  chat,
  onRename,
  onDelete,
}: {
  menu: "dropdown" | "context";
  chat: AgentChatSummary;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const Item = menu === "context" ? ContextMenuItem : DropdownMenuItem;
  const Separator =
    menu === "context" ? ContextMenuSeparator : DropdownMenuSeparator;

  return (
    <>
      <Item onSelect={() => void togglePinned(chat.id)}>
        {chat.pinned ? <PinOff /> : <Pin />}
        <span>{chat.pinned ? t("layout.unpin") : t("agent.pin")}</span>
      </Item>
      <Item onSelect={onRename}>
        <Pencil />
        <span>{t("agent.rename")}</span>
      </Item>
      <Separator />
      <Item variant="destructive" onSelect={onDelete}>
        <Trash2 />
        <span>{t("common.delete")}</span>
      </Item>
    </>
  );
}

export function AgentHistoryRail({
  onNewChat,
  onOpenChat,
}: {
  onNewChat: () => void;
  onOpenChat: (chatId: string) => void;
}) {
  const { t } = useTranslation();
  const chats = useAtomValue(agentChatsAtom);
  const currentId = useAtomValue(agentCurrentChatAtom);
  const syncFailed = useAtomValue(agentSyncFailedAtom);
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AgentChatSummary | null>(
    null,
  );
  const [draftTitle, setDraftTitle] = useState("");
  const skipBlur = useRef(false);

  const buckets = useMemo(
    () => groupChats(filterChats(chats, query), Date.now()),
    [chats, query],
  );
  const chatKeys = useMemo(
    () => new Set(chats.map((chat) => chat.id)),
    [chats],
  );

  const startRename = (chat: AgentChatSummary) => {
    skipBlur.current = false;
    setDraftTitle(chat.title);
    setRenamingId(chat.id);
  };

  const finishRename = (chat: AgentChatSummary, save: boolean) => {
    if (skipBlur.current) return;
    skipBlur.current = true;
    setRenamingId(null);
    const title = draftTitle.trim();
    if (save && title && title !== chat.title) {
      void renameChat(chat.id, title).catch((error) =>
        showFailureToast(t("agent.chatRenameFailed"), error, {
          channels: ["agent:chats:write"],
        }),
      );
    }
  };

  const remove = async (chat: AgentChatSummary) => {
    try {
      if (chat.id === currentId) await leaveRunningChat(false);
      await deleteChat(chat.id);
    } catch (error) {
      showFailureToast(t("agent.chatDeleteFailed"), error, {
        channels: ["agent:chats:delete", "agent:chats:remoteDelete"],
      });
    }
  };

  return (
    <div className="flex h-full min-h-0 w-52 shrink-0 flex-col rounded-xl border border-border bg-surface-1">
      <div className="space-y-2 border-b border-border p-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={onNewChat}
        >
          <Plus className="size-3.5" />
          {t("agent.newChat")}
        </Button>

        {chats.length > 4 && (
          <div className="relative">
            <Search className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-faint" />
            <Input
              value={query}
              placeholder={t("agent.searchChats")}
              aria-label={t("agent.searchChats")}
              className="h-7 pl-7 text-xs"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        )}

        {syncFailed && chats.length > 0 && (
          <button
            type="button"
            onClick={() => void syncChats()}
            className="flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-3xs leading-snug text-warning transition-colors hover:bg-row-hover"
          >
            <CloudOff className="mt-px size-3 shrink-0" />
            <span className="min-w-0 flex-1">{t("agent.syncFailed")}</span>
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {buckets.length === 0 ? (
          <Empty className="p-3">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {chats.length === 0 ? <MessagesSquare /> : <Search />}
              </EmptyMedia>
              <EmptyTitle className="text-xs font-normal text-muted-foreground">
                {chats.length === 0 ? t("agent.noChats") : t("common.notFound")}
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          buckets.map((bucket) => (
            <div key={bucket.id} className="mb-1.5 flex flex-col">
              <span className="block px-2 pb-1 text-3xs font-semibold tracking-[0.09em] text-faint uppercase">
                {t(`agent.history.${bucket.id}`)}
              </span>

              <RemovalList sourceKeys={chatKeys}>
                {bucket.chats.map((chat) => {
                  const isCurrent = chat.id === currentId;
                  const moreLabel = `${t("common.more")} — ${chat.title}`;

                  return (
                    <RemovalItem key={chat.id} itemKey={chat.id}>
                      {renamingId === chat.id ? (
                        <Input
                          autoFocus
                          value={draftTitle}
                          aria-label={t("agent.rename")}
                          className="h-7 text-xs"
                          onChange={(event) =>
                            setDraftTitle(event.target.value)
                          }
                          onBlur={() => finishRename(chat, true)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") finishRename(chat, true);
                            if (event.key === "Escape") {
                              event.stopPropagation();
                              finishRename(chat, false);
                            }
                          }}
                        />
                      ) : (
                        <ContextMenu>
                          <ContextMenuTrigger asChild>
                            <div
                              className={cn(
                                "group flex h-8 items-center gap-1 rounded-lg px-2 transition-colors",
                                isCurrent
                                  ? "bg-row-selected"
                                  : "hover:bg-row-hover",
                              )}
                            >
                              <Hint
                                content={chat.title}
                                variant="text"
                                side="left"
                                truncatedOnly
                              >
                                <button
                                  type="button"
                                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none focus-visible:underline"
                                  onClick={() => onOpenChat(chat.id)}
                                >
                                  {chat.pinned && (
                                    <Pin className="size-3 shrink-0 text-faint" />
                                  )}
                                  <span
                                    className={cn(
                                      "truncate text-xs",
                                      isCurrent
                                        ? "text-foreground"
                                        : "text-muted-foreground",
                                    )}
                                  >
                                    {chat.title}
                                  </span>
                                </button>
                              </Hint>

                              <DropdownMenu>
                                <Hint content={moreLabel} side="right">
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon-xs"
                                      aria-label={moreLabel}
                                      className="shrink-0 text-faint opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                                    >
                                      <Ellipsis />
                                    </Button>
                                  </DropdownMenuTrigger>
                                </Hint>
                                <DropdownMenuContent
                                  align="end"
                                  className="w-44"
                                >
                                  <ChatMenuItems
                                    menu="dropdown"
                                    chat={chat}
                                    onRename={() => startRename(chat)}
                                    onDelete={() => setPendingDelete(chat)}
                                  />
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-44">
                            <ChatMenuItems
                              menu="context"
                              chat={chat}
                              onRename={() => startRename(chat)}
                              onDelete={() => setPendingDelete(chat)}
                            />
                          </ContextMenuContent>
                        </ContextMenu>
                      )}
                    </RemovalItem>
                  );
                })}
              </RemovalList>
            </div>
          ))
        )}
      </div>

      {pendingDelete && (
        <Confirmation
          title={t("agent.chatDeleteQuestion", { name: pendingDelete.title })}
          onClose={() => setPendingDelete(null)}
          reversible={false}
          content={[{ text: t("agent.chatDeleteHint") }]}
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setPendingDelete(null),
            },
            {
              text: t("common.delete"),
              color: "danger",
              onClick: async () => {
                const chat = pendingDelete;
                setPendingDelete(null);
                await remove(chat);
              },
            },
          ]}
        />
      )}
    </div>
  );
}
