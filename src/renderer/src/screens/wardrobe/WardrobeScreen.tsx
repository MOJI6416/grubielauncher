import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { CloudOff, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty";
import { LITTLESKIN_CLOSET_URL } from "@/shared/config";
import { ManageSkins } from "@renderer/components/ManageSkins";
import { accountAtom, internetAtom, networkAtom } from "@renderer/stores/atoms";
import { canOpenSkinManagerForAccount } from "@renderer/utilities/connectivity";
import { navigate } from "@renderer/navigation/navigate";
import type { WardrobeView } from "@renderer/navigation/routes";
import { countFeature } from "@renderer/features/usage/usage";

const api = window.api;

export function WardrobeScreen({ view }: { view?: WardrobeView }) {
  const { t } = useTranslation();
  const account = useAtomValue(accountAtom);
  const isInternetOnline = useAtomValue(internetAtom);
  const isBackendOnline = useAtomValue(networkAtom);

  const canManage = canOpenSkinManagerForAccount(account?.type, {
    isInternetOnline,
    isBackendOnline,
  });

  if (!canManage) {
    const isExternal =
      account?.type === "elyby" || account?.type === "littleskin";

    return (
      <Empty className="h-full rounded-xl border border-border px-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CloudOff />
          </EmptyMedia>
          <EmptyDescription>
            {isExternal
              ? t("app.internetUnavailable")
              : t("app.backendUnavailable")}
          </EmptyDescription>
        </EmptyHeader>
        {isExternal && (
          <EmptyContent>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                void api.shell.openExternal(
                  account?.type === "littleskin"
                    ? LITTLESKIN_CLOSET_URL
                    : "https://ely.by/skins",
                )
              }
            >
              <ExternalLink />
              {t("manageSkins.title")}
            </Button>
          </EmptyContent>
        )}
      </Empty>
    );
  }

  return (
    <ManageSkins
      mode={view === "catalog" ? "catalog" : "wardrobe"}
      onModeChange={(mode, options) => {
        if (mode === "catalog" && options?.byPlayer) {
          countFeature("wardrobe.catalog");
        }
        navigate(
          mode === "catalog"
            ? { name: "wardrobe", view: "catalog" }
            : { name: "wardrobe" },
          options?.replace ? { replace: true } : {},
        );
      }}
    />
  );
}
