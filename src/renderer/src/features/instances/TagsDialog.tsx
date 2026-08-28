import { useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Tag, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { versionsAtom } from "@renderer/stores/atoms";
import { allTags as listTags, instanceKey as keyOf } from "./selectors";
import { instanceTagsAtom, updateInstancesFile } from "./instancesStore";

export function TagsDialog({
  instanceKey,
  name,
  onClose,
}: {
  instanceKey: string;
  name: string;
  onClose: () => void;
}) {
  const tags = useAtomValue(instanceTagsAtom);
  const versions = useAtomValue(versionsAtom);
  const [draft, setDraft] = useState("");
  const { t } = useTranslation();

  const current = tags[instanceKey] ?? [];
  const suggestions = useMemo(() => {
    const taken = new Set(current.map((tag) => tag.toLowerCase()));

    return listTags(tags, versions.map(keyOf)).filter(
      (tag) => !taken.has(tag.toLowerCase()),
    );
  }, [tags, versions, current]);

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;

    updateInstancesFile((file) => {
      const existing = file.tags[instanceKey] || [];
      if (existing.some((item) => item.toLowerCase() === tag.toLowerCase())) {
        return file;
      }
      return {
        ...file,
        tags: { ...file.tags, [instanceKey]: [...existing, tag] },
      };
    });
  };

  const removeTag = (tag: string) => {
    updateInstancesFile((file) => {
      const filtered = (file.tags[instanceKey] || []).filter(
        (item) => item !== tag,
      );
      const next = { ...file.tags };
      if (filtered.length) next[instanceKey] = filtered;
      else delete next[instanceKey];
      return { ...file, tags: next };
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="min-w-0">
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <Tag className="size-5 shrink-0" />
            <span className="truncate">
              {t("versions.tags.title", { name })}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {current.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("versions.tags.empty")}
            </p>
          ) : (
            current.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                {tag}
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-foreground/10"
                  aria-label={t("versions.tags.remove")}
                  onClick={() => removeTag(tag)}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))
          )}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            addTag(draft);
            setDraft("");
          }}
        >
          <Input
            autoFocus
            value={draft}
            placeholder={t("versions.tags.add")}
            maxLength={24}
            onChange={(event) => setDraft(event.target.value)}
          />
        </form>

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((tag) => (
              <Button
                key={tag}
                size="sm"
                variant="outline"
                className="h-7 gap-1"
                onClick={() => addTag(tag)}
              >
                + {tag}
              </Button>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
