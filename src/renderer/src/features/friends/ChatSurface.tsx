import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { toast } from "sonner";
import {
  ArrowDown,
  CheckCheck,
  ChevronUp,
  CircleAlert,
  Clock3,
  Gamepad2,
  ImagePlus,
  Loader2,
  MessageSquareDashed,
  Package,
  Paperclip,
  Reply,
  RotateCw,
  SendHorizontal,
  SmilePlus,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { AccountHead, type HeadFace } from "@renderer/features/accounts/AccountHead";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { cn } from "@/lib/utils";
import { formatClock } from "@renderer/utilities/date";
import { authDataAtom } from "@renderer/stores/atoms";
import type { IModpack } from "@/types/Backend";
import type { Version } from "@renderer/classes/Version";
import {
  parseGroupInviteMessage,
  parseSystemMessage,
  type IMessage,
} from "@/types/IMessage";
import { buildChatRows, getDayLabel } from "./chatTimeline";
import {
  appendedEntries,
  firstUnreadKey,
  quoteMessage,
  type ChatEntry,
} from "./chatEntries";

const api = window.api;

const UNREAD_ANCHOR_OFFSET = 44;
const LINK_PATTERN = /(https?:\/\/[^\s]+)/gi;
const IMAGE_FILE_PATTERN = /\.(apng|gif|jpe?g|png|webp)$/i;
const TRUSTED_LINK_HOSTS = ["grubielauncher.com"];

const EMOJI_FONT_STYLE: CSSProperties = {
  fontFamily:
    '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif',
  lineHeight: 1,
};

const REACTION_EMOJIS = [
  "👍",
  "👎",
  "❤️",
  "😂",
  "😮",
  "😢",
  "🎉",
  "🔥",
  "👏",
  "🙏",
  "😍",
  "😭",
  "🤔",
  "👀",
  "💀",
  "✨",
];

export type SenderView = HeadFace;

function ReactionPicker({
  label,
  onPick,
}: {
  label: string;
  onPick: (emoji: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon-xs"
          variant="ghost"
          className="size-5 rounded-md text-muted-foreground hover:text-foreground"
          aria-label={label}
        >
          <SmilePlus className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        collisionPadding={8}
        className="w-auto max-w-72 p-1"
      >
        <div className="flex flex-wrap gap-0.5">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-base transition-colors hover:bg-accent"
              style={EMOJI_FONT_STYLE}
              aria-label={`${label} ${emoji}`}
              onClick={() => {
                setIsOpen(false);
                onPick(emoji);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function isImageFile(file: File) {
  return file.type.startsWith("image/") || IMAGE_FILE_PATTERN.test(file.name);
}

function isTrustedHost(host: string) {
  return TRUSTED_LINK_HOSTS.some(
    (trusted) => host === trusted || host.endsWith(`.${trusted}`),
  );
}

function isTrustedLink(rawUrl: string) {
  try {
    return isTrustedHost(new URL(rawUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function isTrustedImageUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && isTrustedHost(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export interface ChatSurfaceProps {
  entries: ChatEntry[];
  header: ReactNode;
  resolveSender: (senderId: string) => SenderView;
  isLoadingHistory: boolean;
  isLoadingEarlier?: boolean;
  hasMoreHistory?: boolean;
  historyError?: string | null;
  onReloadHistory?: () => void;
  onLoadEarlier?: () => boolean | void;
  readReceiptKey?: string;
  isSending: boolean;
  isOffline?: boolean;
  unreadCount?: number;
  messageText: string;
  replyMessage?: IMessage | null;
  imageUploadProgress?: number | null;
  modpacks: Map<string, IModpack>;
  failedModpacks: Set<string>;
  goneModpacks?: Set<string>;
  versionsByShareCode: Map<string, Version>;
  canAttachImage: boolean;
  canAttachModpack: boolean;
  emptyHint?: string;
  onMessageChange: (text: string) => void;
  onSend: () => void;
  onSendImageFile: (file: File) => void | Promise<void>;
  onReply: (message: IMessage) => void;
  onCancelReply: () => void;
  onDeleteMessage: (message: IMessage) => void;
  onToggleReaction: (message: IMessage, emoji: string) => void;
  onOpenVersionSelect: () => void;
  onOpenGroupInvite?: () => void;
  onAcceptGroupInvite?: (code: string) => void | Promise<void>;
  onPlayModpack: (modpack: IModpack, version?: Version) => void;
  onRetryModpack?: (modpackId: string) => void;
  onRetry?: (localId: string) => void;
  onDiscard?: (localId: string) => void;
}

function ChatSurfaceComponent({
  entries,
  header,
  resolveSender,
  isLoadingHistory,
  isLoadingEarlier = false,
  hasMoreHistory = false,
  historyError,
  onReloadHistory,
  onLoadEarlier,
  readReceiptKey,
  isSending,
  isOffline,
  unreadCount = 0,
  messageText,
  replyMessage,
  imageUploadProgress,
  modpacks,
  failedModpacks,
  goneModpacks,
  versionsByShareCode,
  canAttachImage,
  canAttachModpack,
  emptyHint,
  onMessageChange,
  onSend,
  onSendImageFile,
  onReply,
  onCancelReply,
  onDeleteMessage,
  onToggleReaction,
  onOpenVersionSelect,
  onOpenGroupInvite,
  onAcceptGroupInvite,
  onPlayModpack,
  onRetryModpack,
  onRetry,
  onDiscard,
}: ChatSurfaceProps) {
  const { t, i18n } = useTranslation();
  const authData = useAtomValue(authDataAtom);
  const ownUserId = authData?.sub;

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [pendingLink, setPendingLink] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<IMessage | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [missedCount, setMissedCount] = useState(0);
  const [joiningInvite, setJoiningInvite] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const [imageAttempt, setImageAttempt] = useState(0);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nodeRefs = useRef(new Map<string, HTMLDivElement>());
  const dragDepthRef = useRef(0);
  const joiningInviteRef = useRef(false);
  const atBottomRef = useRef(true);
  const highlightTimerRef = useRef<number | null>(null);
  const jumpUntilRef = useRef(0);
  const detachRef = useRef<(() => void) | null>(null);
  const anchorRef = useRef<{
    key?: string;
    top: number | null;
    bottom: number;
    count: number;
  } | null>(null);

  const unreadAnchorRef = useRef<string | null>(null);
  const unreadCandidate = useMemo(
    () => firstUnreadKey(entries, ownUserId, unreadCount),
    [entries, ownUserId, unreadCount],
  );

  if (unreadAnchorRef.current === null && unreadCandidate) {
    unreadAnchorRef.current = unreadCandidate;
  }

  const unreadKey = unreadAnchorRef.current ?? undefined;

  const historyErrorText = useMemo(() => {
    if (!historyError) return "";
    const key = `friends.operationErrors.${historyError}`;
    const message = t(key);
    return message === key ? t("friends.operationErrors.unknown") : message;
  }, [historyError, t]);

  const rows = useMemo(
    () =>
      buildChatRows(
        entries.map((entry) => ({
          key: entry.key,
          sender: entry.message.sender,
          time: entry.message.time,
          hasReply: Boolean(entry.message.replyTo),
          isSystem: entry.message.message?._type === "system",
          entry,
        })),
        { unreadKey },
      ),
    [entries, unreadKey],
  );

  const showEarlier = useCallback(() => {
    if (!onLoadEarlier) return;

    const viewport = viewportRef.current;
    const first = entries[0];
    const key = first ? first.message.id || first.key : undefined;
    const node = key ? nodeRefs.current.get(key) : undefined;

    const anchor = {
      key,
      top:
        node && viewport
          ? node.getBoundingClientRect().top -
            viewport.getBoundingClientRect().top
          : null,
      bottom: viewport ? viewport.scrollHeight - viewport.scrollTop : 0,
      count: entries.length,
    };

    if (onLoadEarlier() === false) return;
    anchorRef.current = anchor;
  }, [entries, onLoadEarlier]);

  const setViewport = useCallback((node: HTMLDivElement | null) => {
    const viewport =
      node?.querySelector<HTMLDivElement>(
        '[data-slot="scroll-area-viewport"]',
      ) ?? null;
    if (!viewport || viewport === viewportRef.current) return;

    detachRef.current?.();
    detachRef.current = null;
    viewportRef.current = viewport;

    const handleScroll = () => {
      const distance =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      const atBottom = distance < 48;

      atBottomRef.current = atBottom;
      setIsAtBottom(atBottom);
      if (atBottom) setMissedCount(0);
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    detachRef.current = () =>
      viewport.removeEventListener("scroll", handleScroll);

    if (atBottomRef.current) viewport.scrollTop = viewport.scrollHeight;
    handleScroll();

    requestAnimationFrame(() => {
      if (!atBottomRef.current) return;
      viewport.scrollTop = viewport.scrollHeight;
      handleScroll();
    });
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    atBottomRef.current = true;
    setIsAtBottom(true);
    setMissedCount(0);

    requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    });
  }, []);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || entries.length === anchor.count) return;

    anchorRef.current = null;
    if (entries.length < anchor.count) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    const node = anchor.key ? nodeRefs.current.get(anchor.key) : undefined;
    if (node && anchor.top !== null) {
      const top =
        node.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
      viewport.scrollTop += top - anchor.top;
      return;
    }

    viewport.scrollTop = viewport.scrollHeight - anchor.bottom;
  }, [entries]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !atBottomRef.current || anchorRef.current) return;
    if (Date.now() < jumpUntilRef.current) return;
    viewport.scrollTop = viewport.scrollHeight;
  });

  useEffect(() => {
    if (isLoadingEarlier) return;
    anchorRef.current = null;
  }, [isLoadingEarlier]);

  const lastEntry = entries[entries.length - 1];
  const isLastOwnRef = useRef(false);
  isLastOwnRef.current = Boolean(
    ownUserId && lastEntry && lastEntry.message.sender === ownUserId,
  );

  const isPlacedRef = useRef(false);
  const wasPlacedOnceRef = useRef(false);
  const seenEntriesRef = useRef<ChatEntry[]>([]);

  useEffect(() => {
    const previous = seenEntriesRef.current;
    seenEntriesRef.current = entries;
    if (!isPlacedRef.current) return;

    const appended = appendedEntries(previous, entries);
    if (appended.length === 0) return;

    if (atBottomRef.current || isLastOwnRef.current) {
      scrollToBottom();
      return;
    }

    const incoming = appended.filter(
      (entry) => entry.message.sender !== ownUserId,
    ).length;
    if (incoming > 0) setMissedCount((count) => count + incoming);
  }, [entries, ownUserId, scrollToBottom]);

  useEffect(() => {
    if (isLoadingHistory) {
      isPlacedRef.current = false;
      return;
    }

    if (isPlacedRef.current) return;
    isPlacedRef.current = true;

    if (wasPlacedOnceRef.current) {
      if (atBottomRef.current) scrollToBottom();
      return;
    }
    wasPlacedOnceRef.current = true;

    const viewport = viewportRef.current;
    const node = unreadKey ? nodeRefs.current.get(unreadKey) : undefined;
    if (!viewport || !node) {
      scrollToBottom();
      return;
    }

    atBottomRef.current = false;
    setIsAtBottom(false);

    requestAnimationFrame(() => {
      const top =
        node.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
      viewport.scrollTop += top - UNREAD_ANCHOR_OFFSET;
    });
  }, [isLoadingHistory, unreadKey, scrollToBottom]);

  useEffect(
    () => () => {
      detachRef.current?.();
      detachRef.current = null;
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
      }
    },
    [],
  );

  const jumpToMessage = useCallback(
    (messageId: string) => {
      const node = nodeRefs.current.get(messageId);
      if (!node) {
        toast(
          t(
            hasMoreHistory
              ? "friends.chatQuoteMissing"
              : "friends.chatQuoteGone",
          ),
        );
        return;
      }

      jumpUntilRef.current = Date.now() + 1200;
      atBottomRef.current = false;
      setIsAtBottom(false);
      node.scrollIntoView({ block: "center", behavior: "smooth" });
      setHighlightedKey(messageId);

      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
      }
      highlightTimerRef.current = window.setTimeout(() => {
        setHighlightedKey(null);
        highlightTimerRef.current = null;
      }, 1600);
    },
    [hasMoreHistory, t],
  );

  const setNodeRef = useCallback(
    (key: string) => (node: HTMLDivElement | null) => {
      if (node) nodeRefs.current.set(key, node);
      else nodeRefs.current.delete(key);
    },
    [],
  );

  const formatDayLabel = useCallback(
    (time: string | number | Date) => {
      const label = getDayLabel(time);
      if (label.kind === "today") return t("friends.chatToday");
      if (label.kind === "yesterday") return t("friends.chatYesterday");

      return label.date.toLocaleDateString(i18n.language, {
        day: "numeric",
        month: "long",
        year:
          label.date.getFullYear() === new Date().getFullYear()
            ? undefined
            : "numeric",
      });
    },
    [i18n.language, t],
  );

  const previewOf = useCallback(
    (message: IMessage | NonNullable<IMessage["replyTo"]>) => {
      const type = "message" in message ? message.message._type : message.type;
      const value = "message" in message ? message.message.value : message.value;

      if (type === "image") return t("friends.chatImage");
      if (type === "modpack") return t("friends.chatAttachModpack");
      if (type === "groupInvite") return t("friends.chatGroupInvite");
      return value;
    },
    [t],
  );

  const resizeComposer = useCallback(() => {
    const node = textareaRef.current;
    if (!node) return;

    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 108)}px`;
  }, []);

  useEffect(() => {
    resizeComposer();
  }, [messageText, resizeComposer]);

  useEffect(() => {
    if (!replyMessage) return;
    textareaRef.current?.focus();
  }, [replyMessage]);

  const handleComposerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape" && replyMessage) {
        event.preventDefault();
        onCancelReply();
        return;
      }

      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      if (!messageText.trim() || isSending) return;
      onSend();
    },
    [isSending, messageText, onCancelReply, onSend, replyMessage],
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const file = Array.from(event.clipboardData.files).find(isImageFile);
      if (!file) return;
      event.preventDefault();
      void onSendImageFile(file);
    },
    [onSendImageFile],
  );

  const handleDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!canAttachImage) return;
      if (!Array.from(event.dataTransfer.items).some((item) => item.kind === "file")) {
        return;
      }
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDragging(true);
    },
    [canAttachImage],
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!canAttachImage) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [canAttachImage],
  );

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!canAttachImage) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDragging(false);

      const files = Array.from(event.dataTransfer.files);
      if (files.length === 0) return;

      const file = files.find(isImageFile);
      if (!file) {
        toast.warning(t("friends.chatDropNotImage"));
        return;
      }

      void onSendImageFile(file);
    },
    [canAttachImage, onSendImageFile, t],
  );

  const renderText = useCallback((value: string) => {
    const parts = value.split(LINK_PATTERN).filter((part) => part.length > 0);

    return parts.map((part, index) => {
      if (!/^https?:\/\//i.test(part)) {
        return <Fragment key={index}>{part}</Fragment>;
      }

      return (
        <button
          key={`${part}-${index}`}
          type="button"
          className="break-all text-primary underline underline-offset-4 hover:text-primary/85"
          onClick={(event) => {
            event.stopPropagation();
            if (isTrustedLink(part)) void api.shell.openExternal(part);
            else setPendingLink(part);
          }}
        >
          {part}
        </button>
      );
    });
  }, []);

  const acceptGroupInvite = useCallback(
    async (code: string) => {
      if (!onAcceptGroupInvite || joiningInviteRef.current) return;

      joiningInviteRef.current = true;
      setJoiningInvite(code);
      try {
        await onAcceptGroupInvite(code);
      } finally {
        joiningInviteRef.current = false;
        setJoiningInvite(null);
      }
    },
    [onAcceptGroupInvite],
  );

  const markImageBroken = useCallback((url: string) => {
    setBrokenImages((prev) => (prev.has(url) ? prev : new Set(prev).add(url)));
  }, []);

  const retryImage = useCallback((url: string) => {
    setBrokenImages((prev) => {
      if (!prev.has(url)) return prev;
      const next = new Set(prev);
      next.delete(url);
      return next;
    });
    setImageAttempt((attempt) => attempt + 1);
  }, []);

  const canSend = messageText.trim().length > 0 && !isSending;

  return (
    <section
      data-file-drop-zone={canAttachImage ? "" : undefined}
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {header}

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {isDragging && (
          <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-xl border border-dashed border-primary/60 bg-background/80 text-sm font-medium backdrop-blur-sm">
            {t("friends.chatDropImage")}
          </div>
        )}

        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden px-4 py-3">
          {isLoadingHistory && entries.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              {isOffline ? (
                <>
                  <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                    <CircleAlert className="size-4 text-warning" />
                  </span>
                  <p className="max-w-xs text-xs leading-5 text-muted-foreground">
                    {t("friends.chatOffline")}
                  </p>
                </>
              ) : (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
            </div>
          ) : historyError && entries.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                <CircleAlert className="size-4 text-warning" />
              </span>
              <p className="max-w-xs text-xs leading-5 text-muted-foreground">
                {historyErrorText}
              </p>
              {onReloadHistory && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 gap-1.5 text-xs"
                  onClick={onReloadHistory}
                >
                  <RotateCw className="size-3.5" />
                  {t("common.retry")}
                </Button>
              )}
            </div>
          ) : entries.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                <MessageSquareDashed className="size-4 text-muted-foreground" />
              </span>
              <p className="text-sm font-medium">{t("friends.chatEmpty")}</p>
              {emptyHint && (
                <p className="max-w-xs text-xs leading-5 text-muted-foreground">
                  {emptyHint}
                </p>
              )}
            </div>
          ) : (
            <ScrollArea className="h-full min-w-0 overflow-hidden" ref={setViewport}>
              <div className="flex min-w-0 flex-col pr-3 pb-1">
                <div className="mb-2 flex justify-center">
                  {isLoadingHistory ? (
                    <Loader2 className="my-1.5 size-3.5 animate-spin text-muted-foreground" />
                  ) : historyError ? (
                    <div className="flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-surface-3 px-2 py-1">
                      <CircleAlert className="size-3.5 shrink-0 text-warning" />
                      <span className="min-w-0 truncate text-[11px] leading-4 text-muted-foreground">
                        {historyErrorText}
                      </span>
                      {onReloadHistory && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 shrink-0 gap-1 px-1.5 text-xs"
                          onClick={onReloadHistory}
                        >
                          <RotateCw className="size-3" />
                          {t("common.retry")}
                        </Button>
                      )}
                    </div>
                  ) : hasMoreHistory ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isLoadingEarlier}
                      className="h-7 gap-1.5 text-xs text-muted-foreground"
                      onClick={showEarlier}
                    >
                      {isLoadingEarlier ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <ChevronUp className="size-3.5" />
                      )}
                      {t("friends.chatLoadEarlier")}
                    </Button>
                  ) : (
                    <p className="text-[10px] tracking-wide text-faint uppercase">
                      {t("friends.chatHistoryStart")}
                    </p>
                  )}
                </div>

                {rows.map((row) => {
                  if (row.kind === "day") {
                    return (
                      <div
                        key={row.key}
                        className="mt-5 flex items-center gap-3 first:mt-0"
                      >
                        <span className="h-px flex-1 bg-border" />
                        <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                          {formatDayLabel(row.time)}
                        </span>
                        <span className="h-px flex-1 bg-border" />
                      </div>
                    );
                  }

                  if (row.kind === "unread") {
                    return (
                      <div key={row.key} className="mt-4 flex items-center gap-3">
                        <span className="h-px flex-1 bg-primary/50" />
                        <span className="text-[10px] font-medium tracking-wide text-primary uppercase">
                          {t("friends.chatUnreadDivider")}
                        </span>
                        <span className="h-px flex-1 bg-primary/50" />
                      </div>
                    );
                  }

                  const entry = row.entry.entry;
                  const message = entry.message;
                  if (!message.message) return null;

                  if (message.message._type === "system") {
                    const system = parseSystemMessage(message.message.value);
                    if (!system) return null;

                    return (
                      <p
                        key={row.key}
                        className="my-1.5 text-center text-[10px] leading-4 text-muted-foreground"
                      >
                        {t(`friends.chatSystem.${system.kind}`, {
                          nickname: system.nickname,
                        })}
                      </p>
                    );
                  }

                  const isOwn = Boolean(ownUserId && message.sender === ownUserId);
                  const sender = resolveSender(message.sender);
                  const isModpack = message.message._type === "modpack";
                  const modpackId = isModpack ? String(message.message.value) : "";
                  const modpack = isModpack ? modpacks.get(modpackId) : undefined;
                  const modpackVersion = modpack
                    ? versionsByShareCode.get(modpack._id)
                    : undefined;
                  const reactions = (message.reactions ?? []).filter(
                    (reaction) => reaction.emoji && reaction.users?.length > 0,
                  );

                  return (
                    <div
                      key={row.key}
                      ref={setNodeRef(message.id || row.key)}
                      className={cn(
                        "group/row flex min-w-0 items-start gap-2 rounded-lg transition-colors",
                        row.grouped ? "mt-0.5" : "mt-3 first:mt-0",
                        highlightedKey === (message.id || row.key) &&
                          "bg-primary-soft",
                      )}
                    >
                      {row.grouped ? (
                        <span className="w-8 shrink-0 pt-1 text-center font-mono text-[10px] leading-4 text-faint opacity-0 transition-opacity group-hover/row:opacity-100">
                          {formatClock(new Date(message.time))}
                        </span>
                      ) : (
                        <AccountHead account={sender} size={32} />
                      )}

                      <div className="flex min-w-0 max-w-[82%] flex-col">
                        {!row.grouped && (
                          <p className="mb-0.5 flex min-w-0 items-baseline gap-2 px-1 leading-4">
                            <span className="truncate text-[11px] font-medium">
                              {isOwn ? t("friends.you") : sender.nickname}
                            </span>
                            <span className="shrink-0 font-mono text-[10px] text-faint">
                              {formatClock(new Date(message.time))}
                            </span>
                          </p>
                        )}

                        {message.replyTo && (
                          <button
                            type="button"
                            className="mb-1 flex w-fit max-w-full items-baseline gap-1.5 rounded-md border-l-2 border-primary/50 bg-muted/35 px-2 py-1 text-left text-[10px] leading-4 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                            onClick={() => jumpToMessage(message.replyTo!.id)}
                          >
                            <Reply className="size-2.5 shrink-0" />
                            <span className="shrink-0 font-medium text-foreground/70">
                              {message.replyTo.sender === ownUserId
                                ? t("friends.you")
                                : resolveSender(message.replyTo.sender ?? "")
                                    .nickname}
                            </span>
                            <span className="min-w-0 truncate">
                              {previewOf(message.replyTo)}
                            </span>
                          </button>
                        )}

                        {message.message._type === "text" && (
                          <div
                            className={cn(
                              "w-fit max-w-full rounded-lg border px-3 py-2 text-xs leading-5 whitespace-pre-wrap wrap-anywhere",
                              isOwn
                                ? "border-primary/30 bg-primary-soft-raised"
                                : "border-border bg-surface-3",
                              entry.status === "failed" &&
                                "border-destructive/40 bg-surface-3",
                            )}
                          >
                            {renderText(message.message.value)}
                          </div>
                        )}

                        {message.message._type === "image" &&
                          (isTrustedImageUrl(message.message.value) ? (
                            brokenImages.has(message.message.value) ? (
                              <div className="flex w-fit max-w-full items-center gap-2 rounded-lg border border-border bg-surface-3 px-3 py-2 text-xs">
                                <CircleAlert className="size-4 shrink-0 text-warning" />
                                <p className="min-w-0 truncate text-muted-foreground">
                                  {t("friends.chatAttachmentLoadError")}
                                </p>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 shrink-0 gap-1 px-1.5 text-xs"
                                  onClick={() => retryImage(message.message.value)}
                                >
                                  <RotateCw className="size-3" />
                                  {t("common.retry")}
                                </Button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="w-fit max-w-full overflow-hidden rounded-lg border border-border bg-surface-3 p-1 transition-colors hover:bg-accent"
                                onClick={() => setPreviewImage(message.message.value)}
                              >
                                <img
                                  key={`${message.message.value}-${imageAttempt}`}
                                  src={message.message.value}
                                  className="max-h-56 max-w-full rounded-md object-contain"
                                  alt={t("friends.chatImage")}
                                  loading="lazy"
                                  onError={() =>
                                    markImageBroken(message.message.value)
                                  }
                                  onLoad={() => {
                                    if (atBottomRef.current) scrollToBottom();
                                  }}
                                />
                              </button>
                            )
                          ) : (
                            <div className="w-fit max-w-full rounded-lg border border-border bg-surface-3 px-3 py-2 text-xs leading-5">
                              <p className="mb-1 flex items-center gap-1.5 text-[10px] text-warning">
                                <CircleAlert className="size-3 shrink-0" />
                                {t("friends.chatImageBlocked")}
                              </p>
                              <div className="break-all">
                                {renderText(message.message.value)}
                              </div>
                            </div>
                          ))}

                        {message.message._type === "groupInvite" &&
                          (() => {
                            const invite = parseGroupInviteMessage(
                              message.message.value,
                            );

                            return (
                              <div className="flex w-fit max-w-full items-center gap-2 rounded-lg border border-border bg-surface-3 px-2 py-2 text-xs">
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-soft-raised">
                                  <Users className="size-4 text-primary" />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate">
                                    {invite?.name || t("friends.chatGroupInvite")}
                                  </p>
                                  <p className="truncate text-[10px] text-muted-foreground">
                                    {invite?.name
                                      ? t("friends.chatGroupInvite")
                                      : invite?.code}
                                  </p>
                                </div>
                                {invite && onAcceptGroupInvite && (
                                  <Button
                                    size="icon-sm"
                                    variant="outline"
                                    className="shrink-0"
                                    disabled={joiningInvite !== null}
                                    aria-label={t("friends.chatGroupInviteJoin")}
                                    onClick={() =>
                                      void acceptGroupInvite(invite.code)
                                    }
                                  >
                                    {joiningInvite === invite.code ? (
                                      <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                      <UserPlus size={18} />
                                    )}
                                  </Button>
                                )}
                              </div>
                            );
                          })()}

                        {isModpack &&
                          (modpack ? (
                            <div className="flex w-fit max-w-full items-center gap-2 rounded-lg border border-border bg-surface-3 px-2 py-2 text-xs">
                              {modpack.conf.image && (
                                <img
                                  src={modpack.conf.image}
                                  className="size-8 shrink-0 rounded-md object-cover"
                                  alt={modpack.conf.name}
                                  loading="lazy"
                                />
                              )}
                              <p className="min-w-0 flex-1 truncate">
                                {modpack.conf.name}
                              </p>
                              <Button
                                size="icon-sm"
                                variant="outline"
                                className="shrink-0"
                                aria-label={t("friends.chatAttachModpack")}
                                onClick={() => onPlayModpack(modpack, modpackVersion)}
                              >
                                <Gamepad2 size={18} />
                              </Button>
                            </div>
                          ) : goneModpacks?.has(modpackId) ? (
                            <div className="flex w-fit max-w-full items-center gap-2 rounded-lg border border-border bg-surface-3 px-3 py-2 text-xs">
                              <CircleAlert className="size-4 shrink-0 text-faint" />
                              <p className="min-w-0 truncate text-muted-foreground">
                                {t("friends.chatModpackGone")}
                              </p>
                            </div>
                          ) : failedModpacks.has(modpackId) ? (
                            <div className="flex w-fit max-w-full items-center gap-2 rounded-lg border border-border bg-surface-3 px-3 py-2 text-xs">
                              <CircleAlert className="size-4 shrink-0 text-warning" />
                              <p className="min-w-0 truncate text-muted-foreground">
                                {t("friends.chatAttachmentLoadError")}
                              </p>
                              {onRetryModpack && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 shrink-0 gap-1 px-1.5 text-xs"
                                  onClick={() => onRetryModpack(modpackId)}
                                >
                                  <RotateCw className="size-3" />
                                  {t("common.retry")}
                                </Button>
                              )}
                            </div>
                          ) : (
                            <div className="flex w-fit max-w-full items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                              <Loader2 className="size-4 animate-spin" />
                              <p>{t("friends.chatAttachmentLoading")}</p>
                            </div>
                          ))}

                        {reactions.length > 0 && (
                          <div className="mt-1 flex max-w-full flex-wrap gap-1">
                            {reactions.map((reaction) => {
                              const isSelected = Boolean(
                                ownUserId && reaction.users.includes(ownUserId),
                              );

                              return (
                                <button
                                  key={reaction.emoji}
                                  type="button"
                                  disabled={!message.id}
                                  className={cn(
                                    "flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px] leading-none transition-colors",
                                    isSelected
                                      ? "border-primary/50 bg-primary-soft text-foreground"
                                      : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                                  )}
                                  aria-label={t("friends.chatReaction")}
                                  onClick={() => onToggleReaction(message, reaction.emoji)}
                                >
                                  <span
                                    className="flex size-3.5 items-center justify-center"
                                    style={EMOJI_FONT_STYLE}
                                  >
                                    {reaction.emoji}
                                  </span>
                                  <span className="tabular-nums">
                                    {reaction.users.length}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {entry.status === "sent" &&
                          readReceiptKey === entry.key && (
                            <p className="mt-1 flex items-center gap-1 text-[10px] leading-4 text-faint">
                              <CheckCheck className="size-3" />
                              {t("friends.chatRead")}
                            </p>
                          )}

                        {entry.status !== "sent" && (
                          <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                            {entry.status === "pending" ? (
                              <>
                                <Clock3 className="size-3" />
                                {t("friends.chatSending")}
                              </>
                            ) : (
                              <>
                                <CircleAlert className="size-3 text-destructive" />
                                <span className="text-destructive">
                                  {t("friends.chatFailed")}
                                </span>
                                {onRetry && entry.localId && !isOffline && (
                                  <button
                                    type="button"
                                    className="underline underline-offset-2 hover:text-foreground"
                                    onClick={() => onRetry(entry.localId!)}
                                  >
                                    {t("friends.chatRetry")}
                                  </button>
                                )}
                                {onDiscard && entry.localId && (
                                  <button
                                    type="button"
                                    className="underline underline-offset-2 hover:text-foreground"
                                    onClick={() => onDiscard(entry.localId!)}
                                  >
                                    {t("friends.chatDiscard")}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {message.id && (
                        <div className="flex shrink-0 items-center gap-0.5 self-start rounded-lg border border-border bg-popover p-0.5 opacity-0 shadow-sm transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 has-[[data-state=open]]:opacity-100">
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            className="size-5 rounded-md text-muted-foreground hover:text-foreground"
                            aria-label={t("friends.chatReply")}
                            onClick={() => onReply(message)}
                          >
                            <Reply className="size-3" />
                          </Button>

                          <ReactionPicker
                            label={t("friends.chatReaction")}
                            onPick={(emoji) => onToggleReaction(message, emoji)}
                          />

                          {isOwn && (
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              className="size-5 rounded-md text-muted-foreground hover:text-destructive"
                              aria-label={t("friends.chatDeleteMessage")}
                              onClick={() => setPendingDelete(message)}
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          {!isAtBottom && entries.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
              <Button
                size="sm"
                variant="secondary"
                className="pointer-events-auto h-7 gap-1.5 rounded-full border border-border px-3 text-xs shadow-lg"
                onClick={() => scrollToBottom("smooth")}
              >
                <ArrowDown className="size-3.5" />
                {missedCount > 0
                  ? t("friends.chatNewMessages", { count: missedCount })
                  : t("friends.chatJumpToLatest")}
              </Button>
            </div>
          )}
        </div>

        <div className="relative flex shrink-0 flex-col gap-2 border-t border-border bg-surface-1 px-3 py-2.5">
          {typeof imageUploadProgress === "number" && (
            <>
              <div className="absolute inset-x-0 top-0 h-0.5 bg-muted">
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{ width: `${imageUploadProgress}%` }}
                />
              </div>
              <p className="flex items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
                <Loader2 className="size-3 shrink-0 animate-spin" />
                {t("friends.chatAttachmentLoading")}
                <span className="font-mono tabular-nums">
                  {imageUploadProgress}%
                </span>
              </p>
            </>
          )}

          {isOffline && (
            <p className="flex items-center gap-1.5 text-[11px] text-warning">
              <CircleAlert className="size-3 shrink-0" />
              {t("friends.chatOffline")}
            </p>
          )}

          {replyMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-1.5 text-xs">
              <Reply className="size-3.5 shrink-0 text-muted-foreground" />
              <p className="min-w-0 flex-1 truncate text-muted-foreground">
                {previewOf(replyMessage)}
              </p>
              <Button
                size="icon-xs"
                variant="ghost"
                className="size-6"
                aria-label={t("common.close")}
                onClick={onCancelReply}
              >
                <X className="size-3" />
              </Button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file && isImageFile(file)) void onSendImageFile(file);
              }}
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className="size-9 shrink-0"
                  disabled={!canAttachImage && !canAttachModpack}
                  aria-label={t("friends.chatAttach")}
                >
                  <Paperclip size={18} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top">
                <DropdownMenuItem
                  disabled={!canAttachModpack}
                  onSelect={onOpenVersionSelect}
                >
                  <Package />
                  {t("friends.chatAttachModpack")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canAttachImage}
                  onSelect={() =>
                    window.setTimeout(() => fileInputRef.current?.click(), 0)
                  }
                >
                  <ImagePlus />
                  {t("friends.chatAttachImage")}
                </DropdownMenuItem>
                {onOpenGroupInvite && (
                  <DropdownMenuItem onSelect={onOpenGroupInvite}>
                    <UserPlus />
                    {t("friends.chatGroupInvite")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <textarea
              ref={textareaRef}
              rows={1}
              value={messageText}
              maxLength={4000}
              placeholder={t("friends.chatPlaceholder")}
              aria-label={t("friends.chatPlaceholder")}
              className="max-h-28 min-h-9 min-w-0 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-xs leading-5 outline-none [scrollbar-width:none] placeholder:text-faint focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 [&::-webkit-scrollbar]:hidden"
              onChange={(event) => onMessageChange(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              onPaste={handlePaste}
            />

            <Button
              size="icon"
              variant="secondary"
              className="size-9 shrink-0"
              disabled={!canSend}
              aria-label={t("friends.send")}
              onClick={onSend}
            >
              {isSending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <SendHorizontal size={18} />
              )}
            </Button>
          </div>
        </div>
      </div>

      {pendingLink && (
        <Confirmation
          title={t("friends.chatExternalLinkTitle")}
          onClose={() => setPendingLink(null)}
          content={[
            { text: t("friends.chatExternalLinkWarning"), color: "warning" },
          ]}
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setPendingLink(null),
            },
            {
              text: t("friends.chatExternalLinkOpen"),
              color: "danger",
              onClick: () => {
                void api.shell.openExternal(pendingLink);
                setPendingLink(null);
              },
            },
          ]}
        >
          <p className="rounded-lg border border-border bg-surface-1 px-2.5 py-2 font-mono text-[11px] leading-4 wrap-anywhere text-foreground">
            {pendingLink}
          </p>
        </Confirmation>
      )}

      {pendingDelete && (
        <Confirmation
          title={t("friends.chatDeleteMessage")}
          reversible={false}
          content={[{ text: t("friends.chatDeleteConfirm") }]}
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setPendingDelete(null),
            },
            {
              text: t("common.delete"),
              color: "danger",
              onClick: () => {
                onDeleteMessage(pendingDelete);
                setPendingDelete(null);
              },
            },
          ]}
          onClose={() => setPendingDelete(null)}
        >
          {quoteMessage(previewOf(pendingDelete)) && (
            <p className="rounded-md border-l-2 border-border bg-surface-1 px-2.5 py-1.5 text-xs leading-4.5 wrap-anywhere text-muted-foreground">
              {quoteMessage(previewOf(pendingDelete))}
            </p>
          )}
        </Confirmation>
      )}

      <Dialog
        open={!!previewImage}
        onOpenChange={(open) => {
          if (!open) setPreviewImage(null);
        }}
      >
        <DialogContent
          aria-describedby={undefined}
          style={{
            top: "calc(env(titlebar-area-height, 0px) + 1rem)",
            left: "1rem",
            right: "1rem",
            bottom: "1rem",
            width: "auto",
            height: "auto",
            maxWidth: "none",
            maxHeight: "none",
            margin: 0,
          }}
          className="overflow-hidden p-2"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{t("friends.chatImage")}</DialogTitle>
          </DialogHeader>
          <div className="flex h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-lg bg-muted/20">
            {previewImage && (
              <img
                src={previewImage}
                alt={t("friends.chatImage")}
                className="max-h-full max-w-full object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export const ChatSurface = memo(ChatSurfaceComponent);
