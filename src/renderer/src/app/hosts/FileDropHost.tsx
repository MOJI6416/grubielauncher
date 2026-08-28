import { useEffect, useRef } from "react";
import { getDefaultStore, useAtom, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  openNewInstance,
  setNewInstanceImport,
} from "@renderer/features/instances/newInstance";
import { currentRouteAtom } from "@renderer/navigation/store";
import {
  accountAtom,
  fileDragOverAtom,
  installActiveAtom,
} from "@renderer/stores/atoms";
import { useLatestRef } from "@renderer/utilities/useLatestRef";

const api = window.api;

type DragContext = "main" | "addVersion" | "blocked";

export function FileDropHost() {
  const { t } = useTranslation();
  const tRef = useLatestRef(t);
  const [isFileDragOver, setIsFileDragOver] = useAtom(fileDragOverAtom);
  const route = useAtomValue(currentRouteAtom);
  const isNewInstanceScreenRef = useLatestRef(route.name === "instance-new");
  const contextRef = useRef<DragContext | null>(null);

  useEffect(() => {
    const store = getDefaultStore();

    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types || []).includes("Files");

    const isOwnDropZone = (event: DragEvent) =>
      event.target instanceof Element &&
      event.target.closest("[data-file-drop-zone]") !== null;

    const resolveDragContext = (): DragContext => {
      if (store.get(installActiveAtom)) return "blocked";
      if (document.querySelectorAll('[role="dialog"]').length > 0)
        return "blocked";
      if (isNewInstanceScreenRef.current) return "addVersion";
      return "main";
    };

    const endDrag = () => {
      contextRef.current = null;
      setIsFileDragOver(false);
    };

    const ensureContext = () => {
      if (contextRef.current === null) {
        contextRef.current = resolveDragContext();
      }
      return contextRef.current;
    };

    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      if (isOwnDropZone(event)) {
        setIsFileDragOver(false);
        return;
      }
      if (ensureContext() === "blocked") return;
      event.preventDefault();
      setIsFileDragOver(true);
    };

    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      if (isOwnDropZone(event)) {
        setIsFileDragOver(false);
        return;
      }
      event.preventDefault();
      if (ensureContext() === "blocked") return;
      setIsFileDragOver(true);
    };

    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      if (
        event.clientX <= 0 ||
        event.clientY <= 0 ||
        event.clientX >= window.innerWidth ||
        event.clientY >= window.innerHeight
      ) {
        endDrag();
      }
    };

    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      if (isOwnDropZone(event)) {
        endDrag();
        return;
      }

      event.preventDefault();
      const context = contextRef.current;
      endDrag();

      if (context === "blocked" || context === null) return;

      const file = event.dataTransfer?.files?.[0];
      if (!file) return;

      const name = file.name.toLowerCase();
      if (!name.endsWith(".zip") && !name.endsWith(".mrpack")) {
        toast.warning(tRef.current("addVersion.dropUnsupported"));
        return;
      }

      if (!store.get(accountAtom)) {
        toast.warning(tRef.current("addVersion.dropNoAccount"));
        return;
      }

      const filePath = api.other.getPathForFile(file);
      if (!filePath) {
        toast.warning(tRef.current("addVersion.dropNoPath"));
        return;
      }

      if (context === "addVersion") setNewInstanceImport(filePath);
      else openNewInstance({ importFilePath: filePath });
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [isNewInstanceScreenRef, setIsFileDragOver, tRef]);

  if (!isFileDragOver) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="rounded-xl border-2 border-dashed border-primary bg-card px-10 py-8 text-center shadow-lg">
        <p className="text-lg font-semibold">{t("addVersion.dropTitle")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("addVersion.dropDescription")}
        </p>
      </div>
    </div>
  );
}
