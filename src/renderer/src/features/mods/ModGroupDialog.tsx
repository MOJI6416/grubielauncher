import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderPen, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { normalizeGroupName } from "./modGroups";

export function ModGroupDialog({
  initialName,
  isRename,
  onSubmit,
  onClose,
}: {
  initialName: string;
  isRename: boolean;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(initialName);
  const name = normalizeGroupName(draft);
  const Icon = isRename ? FolderPen : FolderPlus;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <Icon className="size-5 shrink-0" />
            <span className="truncate">
              {t(isRename ? "modGroups.renameTitle" : "modGroups.createTitle")}
            </span>
          </DialogTitle>
        </DialogHeader>

        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name) return;
            onSubmit(name);
            onClose();
          }}
        >
          <Input
            autoFocus
            value={draft}
            maxLength={48}
            aria-label={t("modGroups.name")}
            placeholder={t("modGroups.namePlaceholder")}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" disabled={!name}>
            {t(isRename ? "common.save" : "modGroups.create")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
