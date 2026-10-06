import { useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Hint } from "@renderer/components/Hint";
import {
  STICKER_PACKS,
  findSticker,
  stickerValue,
  type StickerItem,
} from "@renderer/features/stickers/catalog";
import { StickerView } from "@renderer/features/stickers/StickerView";
import { EMOJI_FONT_FAMILY, EMOJI_GROUPS } from "./chatEmoji";
import {
  EMOJI_SPRITE_CELL,
  currentEmojiSprite,
  loadEmojiSprite,
  type EmojiSprite,
} from "./emojiSprite";
import {
  loadRecents,
  pushRecent,
  saveRecents,
  type ExpressionRecents,
} from "./expressionRecents";

const api = window.api;
const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";

type PickerTab = "emoji" | "stickers";

let lastTab: PickerTab = "emoji";
const PICKER_EMOJI = EMOJI_GROUPS.flatMap((group) => group.emoji);

function spriteStyle(sprite: EmojiSprite, index: number): CSSProperties {
  const column = index % sprite.columns;
  const row = Math.floor(index / sprite.columns);
  return {
    backgroundImage: `url("${sprite.url}")`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${sprite.columns * EMOJI_SPRITE_CELL}px ${sprite.rows * EMOJI_SPRITE_CELL}px`,
    backgroundPosition: `-${column * EMOJI_SPRITE_CELL}px -${row * EMOJI_SPRITE_CELL}px`,
  };
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-1 pt-2 pb-1 text-[10px] font-medium tracking-wide text-faint uppercase first:pt-0">
      {children}
    </p>
  );
}

function EmojiGrid({
  emoji,
  sprite,
  onPick,
}: {
  emoji: string[];
  sprite: EmojiSprite | null;
  onPick: (emoji: string) => void;
}) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {emoji.map((item) => (
        <button
          key={item}
          type="button"
          aria-label={item}
          className="flex size-9 items-center justify-center rounded-md text-xl leading-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          style={{ fontFamily: EMOJI_FONT_FAMILY }}
          onClick={() => onPick(item)}
        >
          {sprite?.positions.has(item) ? (
            <span
              aria-hidden
              className="block size-6"
              style={spriteStyle(sprite, sprite.positions.get(item)!)}
            />
          ) : (
            item
          )}
        </button>
      ))}
    </div>
  );
}

function StickerGrid({
  stickers,
  onPick,
}: {
  stickers: StickerItem[];
  onPick: (sticker: StickerItem) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-1">
      {stickers.map((sticker) => (
        <button
          key={stickerValue(sticker)}
          type="button"
          aria-label={sticker.emoji}
          className="flex size-14 items-center justify-center rounded-lg transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          onClick={() => onPick(sticker)}
        >
          <StickerView sticker={sticker} size={48} />
        </button>
      ))}
    </div>
  );
}

export function ExpressionPicker({
  canSendSticker,
  onEmoji,
  onSticker,
  onClosed,
}: {
  canSendSticker: boolean;
  onEmoji: (emoji: string) => void;
  onSticker: (sticker: StickerItem) => void;
  onClosed: () => void;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<PickerTab>(lastTab);
  const [recents, setRecents] = useState<ExpressionRecents>(loadRecents);

  const [sprite, setSprite] = useState<EmojiSprite | null>(currentEmojiSprite);

  useEffect(() => {
    if (sprite) return;
    let cancelled = false;
    const idle = window.requestIdleCallback(
      () => {
        void loadEmojiSprite(PICKER_EMOJI).then((next) => {
          if (!cancelled && next) setSprite(next);
        });
      },
      { timeout: 2000 },
    );
    return () => {
      cancelled = true;
      window.cancelIdleCallback(idle);
    };
  }, [sprite]);

  const remember = (next: ExpressionRecents) => {
    setRecents(next);
    saveRecents(next);
  };

  const pickEmoji = (emoji: string) => {
    remember({ ...recents, emoji: pushRecent(recents.emoji, emoji) });
    onEmoji(emoji);
  };

  const pickSticker = (sticker: StickerItem) => {
    const value = stickerValue(sticker);
    remember({ ...recents, stickers: pushRecent(recents.stickers, value) });
    setIsOpen(false);
    onSticker(sticker);
  };

  const recentStickers = recents.stickers
    .map(findSticker)
    .filter((item): item is StickerItem => item !== null);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <Hint content={t("friends.chatExpressions")}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 text-muted-foreground hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
            aria-label={t("friends.chatExpressions")}
          >
            <Smile size={18} />
          </Button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={8}
        collisionPadding={8}
        className="w-[21rem] p-0"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onClosed();
        }}
      >
        <Tabs
          value={tab}
          onValueChange={(value) => {
            lastTab = value as PickerTab;
            setTab(value as PickerTab);
          }}
          className="gap-0"
        >
          <div className="border-b border-border p-2">
            <TabsList className="h-8 w-full">
              <TabsTrigger value="emoji" className="text-xs">
                {t("friends.chatEmojiTab")}
              </TabsTrigger>
              <TabsTrigger value="stickers" className="text-xs">
                {t("friends.chatStickersTab")}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="emoji" className="mt-0">
            <ScrollArea className="h-72">
              <div className="p-2">
                {recents.emoji.length > 0 && (
                  <>
                    <SectionLabel>{t("friends.chatRecent")}</SectionLabel>
                    <EmojiGrid
                      emoji={recents.emoji}
                      sprite={sprite}
                      onPick={pickEmoji}
                    />
                  </>
                )}
                {EMOJI_GROUPS.map((group) => (
                  <div key={group.id}>
                    <SectionLabel>{t(`friends.emojiGroups.${group.id}`)}</SectionLabel>
                    <EmojiGrid
                      emoji={group.emoji}
                      sprite={sprite}
                      onPick={pickEmoji}
                    />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="stickers" className="mt-0">
            {canSendSticker ? (
              <ScrollArea className="h-72">
                <div className="p-2">
                  {recentStickers.length > 0 && (
                    <>
                      <SectionLabel>{t("friends.chatRecent")}</SectionLabel>
                      <StickerGrid stickers={recentStickers} onPick={pickSticker} />
                    </>
                  )}
                  {STICKER_PACKS.map((pack) => (
                    <div key={pack.id}>
                      <SectionLabel>{t(`friends.stickerPacks.${pack.id}`)}</SectionLabel>
                      <StickerGrid stickers={pack.items} onPick={pickSticker} />
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="flex h-72 items-center justify-center px-6 text-center text-xs leading-5 text-muted-foreground">
                {t("friends.chatStickersOffline")}
              </p>
            )}
            <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5 text-[10px] text-faint">
              <span className="min-w-0 truncate">{t("friends.stickerCredit")}</span>
              <button
                type="button"
                className="shrink-0 underline underline-offset-2 hover:text-foreground"
                onClick={() => void api.shell.openExternal(LICENSE_URL)}
              >
                CC BY 4.0
              </button>
            </div>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
