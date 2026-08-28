import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const api = window.api;

const NOTES_FILE = "notes.txt";
const MAX_LENGTH = 4000;
const SAVE_DELAY_MS = 600;
const SAVED_HINT_MS = 1600;

type NotesStatus = "idle" | "saved" | "failed";

interface PendingNote {
  path: string;
  text: string;
}

async function writeNote(pending: PendingNote): Promise<boolean> {
  try {
    return pending.text.trim()
      ? await api.fs.writeFile(pending.path, pending.text, "utf-8")
      : await api.fs.rimraf(pending.path);
  } catch {
    return false;
  }
}

export function InstanceNotes({ versionPath }: { versionPath: string }) {
  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<NotesStatus>("idle");
  const pathRef = useRef("");
  const pendingRef = useRef<PendingNote | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    let failed = false;
    setLoaded(false);
    setLoadFailed(false);
    setValue("");
    setStatus("idle");

    void (async () => {
      try {
        const file = await api.path.join(versionPath, NOTES_FILE);
        if (cancelled) return;
        pathRef.current = file;

        if (await api.fs.pathExists(file)) {
          const bytes = await api.fs.readFileBuffer(file);
          if (!bytes) failed = true;
          else if (!cancelled) setValue(new TextDecoder().decode(bytes));
        }
      } catch {
        failed = true;
      } finally {
        if (!cancelled) {
          setLoadFailed(failed);
          setLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = undefined;
      }
      if (hintTimerRef.current) {
        clearTimeout(hintTimerRef.current);
        hintTimerRef.current = undefined;
      }

      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) void writeNote(pending);
    };
  }, [versionPath, attempt]);

  const savePending = async () => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;

    const ok = await writeNote(pending);
    if (pathRef.current !== pending.path) return;

    setStatus(ok ? "saved" : "failed");
    if (!ok) return;

    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setStatus("idle"), SAVED_HINT_MS);
  };

  const flushPending = () => {
    if (!pendingRef.current) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = undefined;
    }

    void savePending();
  };

  const persist = (next: string) => {
    const target = pathRef.current;
    if (!target) return;

    pendingRef.current = { path: target, text: next };

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = undefined;
      void savePending();
    }, SAVE_DELAY_MS);
  };

  return (
    <div className="relative h-full">
      <textarea
        value={value}
        disabled={!loaded || loadFailed}
        maxLength={MAX_LENGTH}
        spellCheck={false}
        placeholder={loaded && !loadFailed ? t("versions.notes.placeholder") : ""}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setValue(next);
          persist(next);
        }}
        onBlur={flushPending}
        className="size-full resize-none bg-transparent px-3 py-2 text-xs leading-relaxed text-foreground outline-none placeholder:text-faint disabled:opacity-60"
      />

      {!loaded && (
        <div className="pointer-events-none absolute inset-0 flex flex-col gap-2 px-3 py-2.5">
          <Skeleton className="h-2.5 w-2/3 rounded" />
          <Skeleton className="h-2.5 w-5/12 rounded" />
        </div>
      )}

      {loaded && loadFailed && (
        <div className="absolute inset-0 flex flex-col items-start gap-1.5 px-3 py-2.5">
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-destructive">
            <TriangleAlert className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate">
              {t("versions.notes.loadFailed")}
            </span>
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7"
            onClick={() => setAttempt((current) => current + 1)}
          >
            {t("common.retry")}
          </Button>
        </div>
      )}

      {status !== "idle" && (
        <span
          className={
            status === "failed"
              ? "pointer-events-none absolute right-2 bottom-1.5 text-[0.65rem] text-destructive"
              : "pointer-events-none absolute right-2 bottom-1.5 text-[0.65rem] text-faint"
          }
        >
          {t(
            status === "failed"
              ? "versions.notes.saveFailed"
              : "versions.notes.saved",
          )}
        </span>
      )}
    </div>
  );
}
