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
import { createGroup, renameGroup } from "@/shared/instancesFile";
import { updateInstancesFile } from "./instancesStore";
import { nextGroupId } from "./selectors";

export function GroupDialog({
  group,
  onClose,
}: {
  group?: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(group?.name ?? "");
  const { t } = useTranslation();

  const submit = () => {
    const name = draft.trim();
    if (!name) return;

    updateInstancesFile((file) =>
      group
        ? renameGroup(file, group.id, name)
        : createGroup(
            file,
            nextGroupId(file.groups.map((item) => item.id)),
            name,
          ),
    );
    onClose();
  };

  const Icon = group ? FolderPen : FolderPlus;
  const title = group
    ? t("versions.groups.rename")
    : t("versions.groups.create");
  const action = group ? t("common.save") : t("common.add");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <Icon className="size-5 shrink-0" />
            <span className="truncate">{title}</span>
          </DialogTitle>
        </DialogHeader>

        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Input
            autoFocus
            value={draft}
            placeholder={t("versions.groups.placeholder")}
            onChange={(event) => setDraft(event.target.value)}
          />
          {!group && (
            <p className="text-xs text-muted-foreground">
              {t("versions.groups.hint")}
            </p>
          )}
          <Button type="submit" disabled={!draft.trim()}>
            {action}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
