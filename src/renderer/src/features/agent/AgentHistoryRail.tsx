import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import {
  Check,
  CloudOff,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Hint } from "@renderer/components/Hint";
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
import { filterChats, groupChats } from "./chatGroups";

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
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const buckets = useMemo(
    () => groupChats(filterChats(chats, query), Date.now()),
    [chats, query],
  );

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
              className="h-7 pl-7 text-xs"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        )}

        {syncFailed && chats.length > 0 && (
          <button
            type="button"
            onClick={() => void syncChats()}
            className="flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-[0.65rem] leading-snug text-warning transition-colors hover:bg-surface-3"
          >
            <CloudOff className="mt-px size-3 shrink-0" />
            <span className="min-w-0 flex-1">{t("agent.syncFailed")}</span>
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {buckets.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-faint">
            {chats.length === 0 ? t("agent.noChats") : t("common.notFound")}
          </p>
        ) : (
          buckets.map((bucket) => (
            <div key={bucket.id} className="mb-1.5">
              <span className="block px-2 pb-1 text-[0.65rem] font-semibold tracking-[0.09em] text-faint uppercase">
                {t(`agent.history.${bucket.id}`)}
              </span>

              {bucket.chats.map((chat) => {
                if (renamingId === chat.id) {
                  return (
                    <Input
                      key={chat.id}
                      autoFocus
                      value={draftTitle}
                      className="h-7 text-xs"
                      onChange={(event) => setDraftTitle(event.target.value)}
                      onBlur={() => setRenamingId(null)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          void renameChat(chat.id, draftTitle);
                          setRenamingId(null);
                        }
                        if (event.key === "Escape") setRenamingId(null);
                      }}
                    />
                  );
                }

                if (confirmingId === chat.id) {
                  return (
                    <div
                      key={chat.id}
                      className="flex h-8 items-center gap-1 rounded-lg border border-destructive/40 bg-surface-2 px-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-[0.7rem] text-destructive">
                        {t("common.deletion")}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("common.delete")}
                        onClick={() => {
                          setConfirmingId(null);
                          void (chat.id === currentId
                            ? leaveRunningChat(false).then(() =>
                                deleteChat(chat.id),
                              )
                            : deleteChat(chat.id));
                        }}
                      >
                        <Check className="text-destructive" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("common.cancel")}
                        onClick={() => setConfirmingId(null)}
                      >
                        <X />
                      </Button>
                    </div>
                  );
                }

                return (
                  <div
                    key={chat.id}
                    className={cn(
                      "group flex h-8 items-center gap-1 rounded-lg px-2",
                      chat.id === currentId
                        ? "bg-primary-soft"
                        : "hover:bg-sidebar-accent",
                    )}
                  >
                    <Hint content={chat.title} variant="text" side="left">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                        onClick={() => onOpenChat(chat.id)}
                      >
                        {chat.pinned && (
                          <Pin className="size-3 shrink-0 text-faint" />
                        )}
                        <span
                          className={cn(
                            "truncate text-xs",
                            chat.id === currentId
                              ? "text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {chat.title}
                        </span>
                      </button>
                    </Hint>

                    <span className="hidden shrink-0 items-center group-hover:flex">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("agent.pin")}
                        onClick={() => void togglePinned(chat.id)}
                      >
                        {chat.pinned ? <PinOff /> : <Pin />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("agent.rename")}
                        onClick={() => {
                          setDraftTitle(chat.title);
                          setRenamingId(chat.id);
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("common.delete")}
                        onClick={() => setConfirmingId(chat.id)}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </span>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
