import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Loader2 } from "lucide-react";
import { ICape, ISkinEntry } from "@/types/SkinManager";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TagsInput } from "./TagsInput";
import { resolveLocalImage } from "@renderer/utilities/localMedia";
import { cn } from "@/lib/utils";
import { SkinHead } from "./SkinHead";
import { isGeneratedSkinName } from "./skinLibrary";

export type PublishType = "skin" | "cape" | "pack";

export function PublishSkinDialog({
  skin,
  cape,
  busy,
  onClose,
  onPublish,
}: {
  skin: ISkinEntry | null;
  cape: ICape | null;
  busy: boolean;
  onClose: () => void;
  onPublish: (payload: {
    name: string;
    type: PublishType;
    tags: string[];
  }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [type, setType] = useState<PublishType>("skin");
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    if (!skin) return;

    setName(isGeneratedSkinName(skin.name) ? "" : skin.name);
    setType("skin");
    setTags([]);
  }, [skin?.id]);

  return (
    <Dialog
      open={Boolean(skin)}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        data-account-click-ignore="true"
        className="sm:max-w-sm"
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="size-5" />
            {t("manageSkins.publishTitle")}
          </DialogTitle>
          <DialogDescription>{t("manageSkins.publishNote")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-3">
          <div className="flex shrink-0 items-center gap-1.5">
            <SkinHead url={skin?.url} size={48} alt={skin?.name} />
            {cape ? (
              <img
                src={resolveLocalImage(cape.cape || cape.url)}
                alt=""
                className="h-12 w-8 rounded-md object-contain [image-rendering:pixelated]"
              />
            ) : null}
          </div>
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Label htmlFor="publish-skin-name">
              {t("manageSkins.publishName")}
            </Label>
            <Input
              id="publish-skin-name"
              autoFocus
              value={name}
              maxLength={40}
              placeholder={t("manageSkins.publishNamePlaceholder")}
              onChange={(event) => setName(event.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        {cape ? (
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("manageSkins.publishWhat")}
            </Label>
            <div className="flex gap-1.5">
              {(["skin", "pack", "cape"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setType(value)}
                  disabled={busy}
                  className={cn(
                    "flex-1 rounded-lg border border-border px-2 py-1.5 text-xs font-medium transition-colors",
                    type === value
                      ? "border-primary bg-primary-soft-raised text-foreground"
                      : "text-muted-foreground hover:bg-surface-3",
                  )}
                >
                  {t(`manageSkins.publishType_${value}`)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">
            {t("manageSkins.tagsLabel")}
          </Label>
          <TagsInput value={tags} onChange={setTags} disabled={busy} />
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={busy || !name.trim()}
            onClick={() => void onPublish({ name: name.trim(), type, tags })}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Globe />}
            {t("manageSkins.publish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
