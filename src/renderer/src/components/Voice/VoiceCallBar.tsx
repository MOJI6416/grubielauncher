import { useState } from "react";
import { useAtom } from "jotai";
import {
  accountAtom,
  authDataAtom,
  friendsAtom,
  groupsAtom,
  voiceSessionAtom,
} from "@renderer/stores/atoms";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import {
  ChevronDown,
  ChevronUp,
  EllipsisVertical,
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  PhoneOff,
  Settings2,
  UserX,
  Volume2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  voiceDisconnect,
  voiceSetDeafened,
  voiceSetMicMuted,
  voiceSetParticipantVolume,
} from "@renderer/utilities/voiceClient";
import { VoiceSettingsDialog } from "./VoiceSettingsPanel";

const api = window.api;
const COLLAPSED_STORAGE_KEY = "voice.barCollapsed";

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    return;
  }
}

export function VoiceCallBar() {
  const [session] = useAtom(voiceSessionAtom);
  const [account] = useAtom(accountAtom);
  const [authData] = useAtom(authDataAtom);
  const [groups] = useAtom(groupsAtom);
  const [friends] = useAtom(friendsAtom);
  const { t } = useTranslation();

  const [isCollapsed, setIsCollapsed] = useState(loadCollapsed);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);

  if (session.state === "disconnected") return null;

  const isConnected = session.state === "connected";
  const accessToken = account?.accessToken || "";
  const activeSpeaker = session.participants.find(
    (participant) => participant.isSpeaking,
  );

  const avatarByIdentity = new Map<string, string | null>();
  for (const friend of friends) {
    avatarByIdentity.set(friend.user._id, friend.user.image ?? null);
  }
  const currentGroup = groups.find((group) => group._id === session.roomId);
  for (const member of currentGroup?.members || []) {
    avatarByIdentity.set(member._id, member.image ?? null);
  }
  if (authData?.sub) {
    avatarByIdentity.set(authData.sub, account?.image ?? null);
  }

  const roomTitle = currentGroup?.name ?? session.roomName;
  const isRoomOwner = currentGroup?.isOwner ?? session.isRoomOwner;

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      saveCollapsed(!prev);
      return !prev;
    });
  };

  const handleKick = async (identity: string) => {
    if (!accessToken || !session.roomId) return;
    const ok = await api.backend.groupKickMember(
      accessToken,
      session.roomId,
      identity,
    );
    if (!ok) toast.error(t("groups.actionError"));
  };

  const muteButton = (
    <Button
      size="icon"
      variant={session.isMicMuted ? "destructive" : "outline"}
      className="size-7"
      onClick={() => void voiceSetMicMuted(!session.isMicMuted)}
      aria-label={session.isMicMuted ? t("voice.unmute") : t("voice.mute")}
    >
      {session.isMicMuted ? (
        <MicOff className="size-3.5" />
      ) : (
        <Mic className="size-3.5" />
      )}
    </Button>
  );

  const deafenButton = (
    <Button
      size="icon"
      variant={session.isDeafened ? "destructive" : "outline"}
      className="size-7"
      onClick={() => void voiceSetDeafened(!session.isDeafened)}
      aria-label={session.isDeafened ? t("voice.undeafen") : t("voice.deafen")}
    >
      {session.isDeafened ? (
        <HeadphoneOff className="size-3.5" />
      ) : (
        <Headphones className="size-3.5" />
      )}
    </Button>
  );

  if (isCollapsed) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1.5 shadow-lg">
        <span
          className={`size-2 shrink-0 rounded-full ${
            !isConnected
              ? "animate-pulse bg-yellow-500"
              : activeSpeaker
                ? "animate-pulse bg-emerald-500"
                : "bg-muted-foreground/40"
          }`}
        />
        <span className="max-w-32 truncate text-xs">
          {activeSpeaker ? activeSpeaker.name : roomTitle}
        </span>
        {muteButton}
        {deafenButton}
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={toggleCollapsed}
          aria-label={t("voice.expand")}
        >
          <ChevronUp className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="destructive"
          className="size-7"
          onClick={() => void voiceDisconnect()}
          aria-label={t("voice.disconnect")}
        >
          <PhoneOff className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <Card className="fixed bottom-4 right-4 z-50 w-72 gap-0 py-0 shadow-lg">
        <CardHeader className="px-3 py-2">
          <CardTitle className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{roomTitle}</span>
            <span className="flex shrink-0 items-center gap-1">
              <Badge variant={isConnected ? "default" : "secondary"}>
                {isConnected
                  ? t("voice.connected")
                  : session.state === "reconnecting"
                    ? t("voice.reconnecting")
                    : t("voice.connecting")}
              </Badge>
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                onClick={toggleCollapsed}
                aria-label={t("voice.collapse")}
              >
                <ChevronDown className="size-3.5" />
              </Button>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 px-3 pb-2.5">
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {session.participants.map((participant) => (
              <div
                key={participant.identity}
                className={`flex items-center justify-between gap-1.5 rounded px-1.5 py-0.5 text-sm ${
                  participant.isSpeaking ? "bg-primary/20" : ""
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Avatar
                    size="sm"
                    className={`h-5 w-5 shrink-0 ${
                      participant.isSpeaking ? "ring-2 ring-emerald-500/80" : ""
                    }`}
                  >
                    <AvatarImage
                      src={avatarByIdentity.get(participant.identity) || ""}
                      alt={participant.name}
                    />
                    <AvatarFallback className="text-[9px]">
                      {participant.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">
                    {participant.name}
                    {participant.isLocal ? ` ${t("voice.you")}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-0.5">
                  {participant.isMuted && (
                    <MicOff className="size-3.5 text-muted-foreground" />
                  )}
                  {!participant.isLocal && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="secondary"
                          className="size-7"
                        >
                          <EllipsisVertical className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <div className="px-2 py-1.5">
                          <p className="mb-1.5 flex items-center justify-between gap-1.5 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <Volume2 className="size-3.5" />
                              {t("voice.volume")}
                            </span>
                            <span>{Math.round(participant.volume * 100)}%</span>
                          </p>
                          <Slider
                            value={[Math.round(participant.volume * 100)]}
                            max={200}
                            step={1}
                            onValueChange={(value) =>
                              voiceSetParticipantVolume(
                                participant.identity,
                                (value[0] ?? 100) / 100,
                              )
                            }
                          />
                        </div>
                        {isRoomOwner && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() =>
                                void handleKick(participant.identity)
                              }
                            >
                              <UserX className="size-3.5" />
                              {t("voice.kick")}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {muteButton}
            {deafenButton}
            <Button
              size="icon"
              variant="outline"
              className="size-7"
              onClick={() => setShowVoiceSettings(true)}
              aria-label={t("settings.sections.voice")}
            >
              <Settings2 className="size-3.5" />
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="destructive"
              className="h-7"
              onClick={() => void voiceDisconnect()}
            >
              <PhoneOff className="size-3.5" />
              {t("voice.disconnect")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <VoiceSettingsDialog
        open={showVoiceSettings}
        onOpenChange={setShowVoiceSettings}
      />
    </>
  );
}
