import { useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Check, Download, Loader2, Package, Pencil, X } from "lucide-react";
import { Hint } from "@renderer/components/Hint";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { IGroup } from "@/types/Voice";
import { versionsAtom } from "@renderer/stores/atoms";
import { loadGroups } from "@renderer/features/friends/groups";
import { openNewInstance } from "@renderer/features/instances/newInstance";
import { showFailureToast } from "@renderer/utilities/failures";
import { usePackManifest } from "@renderer/utilities/packShortCode";

const api = window.api;

export function GroupPack({
  group,
  accessToken,
}: {
  group: IGroup;
  accessToken: string;
}) {
  const { t } = useTranslation();
  const versions = useAtomValue(versionsAtom);
  const [isSaving, setSaving] = useState(false);

  const packCode = group.packCode || undefined;
  const manifest = usePackManifest(packCode);
  const installed = packCode
    ? versions.find((version) => version.version.shareCode === packCode)
    : undefined;
  const choices = useMemo(
    () => versions.filter((version) => version.version.shareCode),
    [versions],
  );

  if (!packCode && !group.isOwner) return null;

  const name =
    manifest?.conf.name ||
    installed?.version.name ||
    (manifest === undefined && packCode ? "" : t("groups.pack.none"));
  const details = manifest
    ? [manifest.conf.loader?.name, manifest.conf.version?.id]
        .filter(Boolean)
        .join(" · ")
    : "";

  const savePack = async (code: string) => {
    if (isSaving) return;
    setSaving(true);
    try {
      const updated = await api.backend.groupSetPack(
        accessToken,
        group._id,
        code,
      );
      if (!updated) {
        showFailureToast(t("groups.actionError"), undefined, {
          channels: ["backend:groupSetPack"],
        });
        return;
      }
      void loadGroups();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface-2 py-1 pr-1 pl-2.5">
      <Package className="size-4 shrink-0 text-faint" />
      <div className="flex min-w-0 flex-1 flex-col">
        {name ? (
          <Hint content={name} variant="text" truncatedOnly>
            <span
              className={
                packCode
                  ? "min-w-0 truncate text-[13px]"
                  : "min-w-0 truncate text-[13px] text-muted-foreground"
              }
            >
              {name}
            </span>
          </Hint>
        ) : (
          <Loader2 className="size-3.5 animate-spin text-faint" />
        )}
        {details && (
          <span className="min-w-0 truncate text-2xs text-muted-foreground">
            {details}
          </span>
        )}
      </div>

      {packCode && installed && (
        <span className="flex shrink-0 items-center gap-1 text-2xs text-muted-foreground">
          <Check className="size-3.5" />
          {t("groups.pack.installed")}
        </span>
      )}
      {packCode && !installed && manifest && (
        <Button
          size="sm"
          variant="secondary"
          className="h-7 shrink-0"
          onClick={() => openNewInstance({ modpack: manifest })}
        >
          <Download className="size-3.5" />
          {t("groups.pack.install")}
        </Button>
      )}

      {group.isOwner && (
        <DropdownMenu>
          <Hint content={t("groups.pack.choose")}>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                className="size-7 shrink-0"
                disabled={isSaving}
                aria-label={t("groups.pack.choose")}
              >
                {isSaving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Pencil className="size-3.5" />
                )}
              </Button>
            </DropdownMenuTrigger>
          </Hint>
          <DropdownMenuContent align="end" className="w-60">
            {choices.length === 0 ? (
              <DropdownMenuItem disabled>
                {t("groups.pack.noChoices")}
              </DropdownMenuItem>
            ) : (
              choices.map((version) => (
                <DropdownMenuItem
                  key={version.version.shareCode}
                  onSelect={() => void savePack(version.version.shareCode!)}
                >
                  <Package />
                  <span className="min-w-0 flex-1 truncate">
                    {version.version.name}
                  </span>
                  {version.version.shareCode === packCode && <Check />}
                </DropdownMenuItem>
              ))
            )}
            {packCode && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void savePack("")}>
                  <X />
                  {t("groups.pack.clear")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
