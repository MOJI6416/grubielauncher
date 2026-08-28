import { Suspense, useEffect } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { currentRouteAtom } from "@renderer/navigation/store";
import { navigate } from "@renderer/navigation/navigate";
import {
  isRouteAllowed,
  routeBlockReason,
  routeBlockedKey,
} from "@renderer/navigation/access";
import {
  accountAtom,
  selectedVersionAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { instanceSelectionSignatureAtom } from "@renderer/features/instances/atoms";
import { instanceKey } from "@renderer/features/instances/selectors";
import { selectInstance } from "@renderer/features/instances/selectInstance";
import {
  instanceMountKey,
  shouldReselectInstance,
} from "@renderer/features/instances/instanceSelection";
import { PanelFallback } from "@renderer/components/PanelFallback";
import { NewsFeedSkeleton } from "@renderer/features/news/NewsFeedSkeleton";
import type {
  JoinFriendWorldParams,
  RunGameParams,
} from "@renderer/features/launch/types";
import { ScreenFallback } from "./ScreenFallback";
import {
  LazyAgentScreen,
  LazyInstanceScreen,
  LazyNewInstanceScreen,
  LazyNewsScreen,
  LazyPeopleScreen,
  LazySettingsScreen,
} from "./lazyScreens";
import { HomeScreen } from "./home/HomeScreen";
import { ProfileScreen } from "./profile/ProfileScreen";
import { AccountsScreen } from "./accounts/AccountsScreen";

export function Router({
  runGame,
  joinFriendWorld,
  onShowWhatsNew,
}: {
  runGame: (params: RunGameParams) => Promise<void>;
  joinFriendWorld: (params: JoinFriendWorldParams) => Promise<void>;
  onShowWhatsNew: () => void;
}) {
  const route = useAtomValue(currentRouteAtom);
  const [selectedVersion] = useAtom(selectedVersionAtom);
  const versions = useAtomValue(versionsAtom);
  const account = useAtomValue(accountAtom);
  const selectionSignature = useAtomValue(instanceSelectionSignatureAtom);
  const { t } = useTranslation();

  useEffect(() => {
    const blocked = routeBlockReason(route, {
      accountType: account?.type ?? null,
    });
    if (!blocked) return;

    navigate({ name: "home" }, { force: true, replace: true });
    toast.info(t(routeBlockedKey(blocked)));
  }, [route, account, t]);

  useEffect(() => {
    if (route.name !== "instance") return;

    const target = versions.find(
      (version) => instanceKey(version) === route.id,
    );

    if (!target) {
      navigate({ name: "home" }, { force: true, replace: true });
      return;
    }

    const stale = shouldReselectInstance(
      {
        signature: selectionSignature,
        selectedKey: selectedVersion ? instanceKey(selectedVersion) : null,
      },
      route.id,
      account,
    );
    if (!stale) return;

    void selectInstance(target, account);
  }, [route, versions, selectedVersion, account, selectionSignature]);

  if (
    route.name === "instance" &&
    selectedVersion &&
    instanceKey(selectedVersion) === route.id
  ) {
    return (
      <Suspense fallback={<PanelFallback variant="tabs" />}>
        <LazyInstanceScreen
          key={instanceMountKey(selectedVersion)}
          runGame={runGame}
        />
      </Suspense>
    );
  }

  if (route.name === "instance-new") {
    return (
      <Suspense fallback={<PanelFallback variant="wizard" />}>
        <LazyNewInstanceScreen />
      </Suspense>
    );
  }

  if (route.name === "settings") {
    return (
      <Suspense fallback={<ScreenFallback />}>
        <LazySettingsScreen
          section={route.section}
          onShowWhatsNew={onShowWhatsNew}
        />
      </Suspense>
    );
  }

  if (route.name === "people") {
    return (
      <Suspense fallback={<PanelFallback variant="roster" />}>
        <LazyPeopleScreen runGame={runGame} joinFriendWorld={joinFriendWorld} />
      </Suspense>
    );
  }

  if (route.name === "news") {
    return (
      <Suspense fallback={<NewsFeedSkeleton />}>
        <LazyNewsScreen />
      </Suspense>
    );
  }

  if (
    route.name === "agent" &&
    isRouteAllowed(route, { accountType: account?.type ?? null })
  ) {
    return (
      <Suspense fallback={<PanelFallback variant="rail" />}>
        <LazyAgentScreen chatId={route.chatId} />
      </Suspense>
    );
  }

  if (route.name === "profile") {
    return <ProfileScreen userId={route.userId} tab={route.tab} />;
  }

  if (route.name === "accounts") {
    return <AccountsScreen />;
  }

  return <HomeScreen runGame={runGame} />;
}
