import { Onboarding } from "@renderer/components/Onboarding";
import { WebLoginPrompt } from "@renderer/components/Modals/WebLoginPrompt";
import { AchievementsHost } from "./hosts/AchievementsHost";
import { BootstrapHost } from "./hosts/BootstrapHost";
import { ConnectivityHost } from "./hosts/ConnectivityHost";
import { ConsoleHost } from "./hosts/ConsoleHost";
import { CrashHost } from "./hosts/CrashHost";
import { DeepLinkHost } from "./hosts/DeepLinkHost";
import { FileDropHost } from "./hosts/FileDropHost";
import { FriendsEventsHost } from "./hosts/FriendsEventsHost";
import { FriendsSocketHost } from "./hosts/FriendsSocketHost";
import { GameInviteHost } from "./hosts/GameInviteHost";
import { InstallHost } from "./hosts/InstallHost";
import { LaunchHost } from "./hosts/LaunchHost";
import { PresenceHost } from "./hosts/PresenceHost";
import { RpcHost } from "./hosts/RpcHost";
import { ShareHost } from "./hosts/ShareHost";
import { SystemEventsHost } from "./hosts/SystemEventsHost";
import { UnsavedCloseHost } from "./hosts/UnsavedCloseHost";
import { VoiceCallHost } from "./hosts/VoiceCallHost";
import { VoiceOverlayHost } from "./hosts/VoiceOverlayHost";
import { WhatsNewHost } from "./hosts/WhatsNewHost";
import { AccentHost } from "./hosts/AccentHost";
import { TrayHost } from "./hosts/TrayHost";
import { AppUpdateHost } from "./hosts/AppUpdateHost";
import { SupportHost } from "./hosts/SupportHost";
import { StreamerModeHost } from "./hosts/StreamerModeHost";

export function AppHosts() {
  return (
    <>
      <BootstrapHost />
      <StreamerModeHost />
      <AccentHost />
      <AppUpdateHost />
      <TrayHost />
      <LaunchHost />
      <ConsoleHost />
      <InstallHost />
      <ConnectivityHost />
      <RpcHost />
      <ShareHost />
      <PresenceHost />
      <FriendsSocketHost />
      <FriendsEventsHost />
      <VoiceCallHost />
      <VoiceOverlayHost />
      <GameInviteHost />
      <CrashHost />
      <SupportHost />
      <AchievementsHost />
      <SystemEventsHost />
      <DeepLinkHost />
      <FileDropHost />
      <UnsavedCloseHost />
      <Onboarding />
      <WhatsNewHost />
      <WebLoginPrompt />
    </>
  );
}
