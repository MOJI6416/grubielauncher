import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CircleAlert, Layers, Loader2, Plus, Trash2 } from "lucide-react";
import type { ILocalProject } from "@/types/ModManager";
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
import { cn } from "@/lib/utils";
import { getLoaderInfo } from "@renderer/components/Loaders";
import type { PortTarget } from "@renderer/features/port/analyzePort";
import { PortPreview } from "@renderer/features/port/PortPreview";
import { type PortItem, portedProjects } from "@renderer/features/port/portPlan";
import { findSetByName, normalizeSetName, toSetItems } from "./modSets";
import { deleteModSet, saveModSet, useModSets } from "./modSetsStore";
import { resolveModSet } from "./resolveModSet";

export type ModSetsDialogMode =
  | { kind: "save"; mods: ILocalProject[]; defaultName: string }
  | { kind: "apply" };

function SaveSetView({
  mods,
  defaultName,
  onClose,
}: {
  mods: ILocalProject[];
  defaultName: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const sets = useModSets();
  const [name, setName] = useState(defaultName);
  const [isSaving, setIsSaving] = useState(false);
  const count = useMemo(() => toSetItems(mods).length, [mods]);
  const existing = sets ? findSetByName(sets, name) : undefined;
  const canSave = count > 0 && !!normalizeSetName(name) && !isSaving;

  const save = async () => {
    if (!canSave) return;
    setIsSaving(true);
    const set = await saveModSet(name, mods);
    setIsSaving(false);

    if (!set) {
      toast.error(t("modSets.saveFailed"));
      return;
    }
    toast.success(t("modSets.saved", { name: set.name }));
    onClose();
  };

  return (
    <>
      <DialogHeader className="min-w-0">
        <DialogTitle className="flex min-w-0 items-center gap-2">
          <Layers className="size-5 shrink-0" />
          <span className="truncate">{t("modSets.saveTitle")}</span>
        </DialogTitle>
        <DialogDescription>{t("modSets.saveDescription")}</DialogDescription>
      </DialogHeader>

      <form
        className="flex min-w-0 flex-col gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Label htmlFor="mod-set-name">{t("modSets.name")}</Label>
        <Input
          id="mod-set-name"
          autoFocus
          value={name}
          maxLength={64}
          placeholder={t("modSets.namePlaceholder")}
          onChange={(event) => setName(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {count === 0
            ? t("modSets.nothingToSave")
            : existing
              ? t("modSets.mergeHint", { name: existing.name, count })
              : t("modSets.saveCount", { count })}
        </p>
      </form>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button disabled={!canSave} onClick={() => void save()}>
          {isSaving ? <Loader2 className="animate-spin" /> : <Layers />}
          {t("modSets.save")}
        </Button>
      </DialogFooter>
    </>
  );
}

function ApplySetView({
  target,
  installed,
  onAdd,
  onClose,
}: {
  target: PortTarget;
  installed: ILocalProject[];
  onAdd: (projects: ILocalProject[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const sets = useModSets();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [items, setItems] = useState<PortItem[] | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestRef = useRef(0);

  const selected = sets?.find((set) => set.id === selectedId) ?? null;
  const targetLabel = `${target.minecraftVersion} ${getLoaderInfo(target.loader).name}`;
  const toAdd = useMemo(() => (items ? portedProjects(items) : []), [items]);

  useEffect(() => {
    const requestId = ++requestRef.current;
    setItems(null);
    setFailed(false);
    if (!selected) {
      setIsResolving(false);
      return;
    }

    setIsResolving(true);
    resolveModSet(selected, target, installed)
      .then((result) => {
        if (requestId === requestRef.current) setItems(result);
      })
      .catch(() => {
        if (requestId === requestRef.current) setFailed(true);
      })
      .finally(() => {
        if (requestId === requestRef.current) setIsResolving(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.updatedAt]);

  const remove = async (id: string, name: string) => {
    setConfirmDelete(null);
    if (selectedId === id) setSelectedId(null);
    if (await deleteModSet(id)) toast.success(t("modSets.deleted", { name }));
    else toast.error(t("modSets.saveFailed"));
  };

  return (
    <>
      <DialogHeader className="min-w-0">
        <DialogTitle className="flex min-w-0 items-center gap-2">
          <Layers className="size-5 shrink-0" />
          <span className="truncate">{t("modSets.applyTitle")}</span>
        </DialogTitle>
        <DialogDescription>
          {t("modSets.applyDescription", { target: targetLabel })}
        </DialogDescription>
      </DialogHeader>

      <div className="flex min-w-0 flex-col gap-3">
        {!sets ? (
          <div className="flex h-16 items-center justify-center">
            <Loader2 className="size-4 animate-spin text-faint" />
          </div>
        ) : sets.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            {t("modSets.empty")}
          </p>
        ) : (
          <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {sets.map((set) => (
              <li key={set.id} className="flex min-w-0 items-center gap-1">
                <button
                  type="button"
                  aria-pressed={set.id === selectedId}
                  onClick={() => setSelectedId(set.id)}
                  className={cn(
                    "flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 text-left transition-colors",
                    set.id === selectedId
                      ? "border-primary/50 bg-primary-soft"
                      : "border-border hover:bg-surface-2",
                  )}
                >
                  <Layers className="size-4 shrink-0 text-faint" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {set.name}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-faint tabular-nums">
                    {t("modSets.items", { count: set.items.length })}
                  </span>
                </button>
                {confirmDelete === set.id ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-9"
                    onClick={() => void remove(set.id, set.name)}
                  >
                    {t("common.delete")}
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-9 text-faint hover:bg-destructive/15 hover:text-destructive"
                    aria-label={t("modSets.delete")}
                    onClick={() => setConfirmDelete(set.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {isResolving ? (
          <p className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {t("port.checking", { target: targetLabel })}
          </p>
        ) : failed ? (
          <p className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <CircleAlert className="size-3.5 shrink-0" />
            {t("port.checkFailed")}
          </p>
        ) : items ? (
          <PortPreview
            items={items}
            target={targetLabel}
            emptyText={t("modSets.emptySet")}
            groupsKey="modSets.groups"
          />
        ) : null}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={isResolving || toAdd.length === 0}
          onClick={() => {
            onAdd(toAdd);
            onClose();
          }}
        >
          <Plus />
          {t("modSets.add", { count: toAdd.length })}
        </Button>
      </DialogFooter>
    </>
  );
}

export function ModSetsDialog({
  mode,
  target,
  installed,
  onAdd,
  onClose,
}: {
  mode: ModSetsDialogMode;
  target: PortTarget | null;
  installed: ILocalProject[];
  onAdd: (projects: ILocalProject[]) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {mode.kind === "save" ? (
          <SaveSetView
            mods={mode.mods}
            defaultName={mode.defaultName}
            onClose={onClose}
          />
        ) : target ? (
          <ApplySetView
            target={target}
            installed={installed}
            onAdd={onAdd}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
