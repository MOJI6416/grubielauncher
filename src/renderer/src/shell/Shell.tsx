import { ReactNode, useCallback, useEffect, useState } from "react";
import { getDefaultStore } from "jotai";
import { toast } from "sonner";
import i18n from "@renderer/i18n";
import { agentBlockReason, blockReasonKey } from "@renderer/navigation/access";
import { accountAtom } from "@renderer/stores/atoms";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CommandPalette } from "./CommandPalette";
import type { RunGameParams } from "@renderer/features/launch/types";
import { openAgent } from "@renderer/features/agent/openAgent";
import { goBack, goForward } from "@renderer/navigation/navigate";
import { isAgentShortcut } from "./shortcuts";

export function Shell({
  runGame,
  children,
  aside,
}: {
  runGame: (params: RunGameParams) => Promise<void>;
  children: ReactNode;
  aside?: ReactNode;
}) {
  const [isPaletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const withModifier = event.ctrlKey || event.metaKey;

      if (withModifier && !event.shiftKey && event.code === "KeyK") {
        event.preventDefault();
        setPaletteQuery("");
        setPaletteOpen((value) => !value);
        return;
      }

      if (withModifier && event.shiftKey && event.code === "KeyP") {
        event.preventDefault();
        setPaletteQuery(">");
        setPaletteOpen(true);
        return;
      }

      if (isAgentShortcut(event)) {
        event.preventDefault();
        setPaletteOpen(false);

        const blocked = agentBlockReason(
          getDefaultStore().get(accountAtom)?.type,
        );
        if (blocked) {
          toast.info(i18n.t(blockReasonKey(blocked)));
          return;
        }

        openAgent();
        return;
      }

      if (!event.altKey) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goBack();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goForward();
      }
    };

    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 3) goBack();
      if (event.button === 4) goForward();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const openPalette = useCallback(() => {
    setPaletteQuery("");
    setPaletteOpen(true);
  }, []);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      <TopBar onOpenPalette={openPalette} />

      <div className="flex min-h-0 flex-1">
        <Sidebar />

        <main className="min-h-0 min-w-0 flex-1 overflow-hidden px-4 py-3">
          {children}
        </main>
        {aside}
      </div>

      <CommandPalette
        open={isPaletteOpen}
        onOpenChange={setPaletteOpen}
        initialQuery={paletteQuery}
        runGame={runGame}
      />
    </div>
  );
}
