import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { IConsoleMessage } from "@/types/Console";
import { consolesAtom } from "@renderer/stores/atoms";

const api = window.api;
const MAX_CONSOLE_MESSAGES = 1000;

export function ConsoleHost() {
  const setConsoles = useSetAtom(consolesAtom);

  useEffect(() => {
    const unsubscribeStatus = api.events.onConsoleChangeStatus(
      async (versionName, instance, status) => {
        setConsoles((prev) => {
          const idx = prev.consoles.findIndex(
            (c) => c.versionName === versionName && c.instance === instance,
          );
          if (idx === -1) return prev;

          const next = [...prev.consoles];
          next[idx] = { ...next[idx], status };
          return { consoles: next };
        });
      },
    );

    const pendingMessages = new Map<string, IConsoleMessage[]>();
    let flushHandle: number | null = null;

    const flushMessages = () => {
      flushHandle = null;
      if (pendingMessages.size === 0) return;

      const batch = new Map(pendingMessages);
      pendingMessages.clear();

      setConsoles((prev) => {
        let next: typeof prev.consoles | null = null;

        for (const [key, messages] of batch) {
          const idx = prev.consoles.findIndex(
            (c) => `${c.instance}:${c.versionName}` === key,
          );
          if (idx === -1) continue;

          if (!next) next = [...prev.consoles];
          next[idx] = {
            ...next[idx],
            messages: [...next[idx].messages, ...messages].slice(
              -MAX_CONSOLE_MESSAGES,
            ),
          };
        }

        return next ? { consoles: next } : prev;
      });
    };

    const unsubscribeMessage = api.events.onConsoleMessage(
      async (versionName, instance, message) => {
        const key = `${instance}:${versionName}`;
        const queued = pendingMessages.get(key);
        if (queued) {
          queued.push(message);
        } else {
          pendingMessages.set(key, [message]);
        }

        if (flushHandle === null) {
          flushHandle = requestAnimationFrame(flushMessages);
        }
      },
    );

    const unsubscribeClear = api.events.onConsoleClear(
      async (versionName, instance) => {
        pendingMessages.delete(`${instance}:${versionName}`);
        setConsoles((prev) => {
          const idx = prev.consoles.findIndex(
            (c) => c.versionName === versionName && c.instance === instance,
          );
          if (idx === -1) return prev;

          const next = [...prev.consoles];
          next[idx] = { ...next[idx], messages: [], startTime: Date.now() };
          return { consoles: next };
        });
      },
    );

    return () => {
      unsubscribeStatus();
      unsubscribeMessage();
      if (flushHandle !== null) {
        cancelAnimationFrame(flushHandle);
        flushHandle = null;
      }
      unsubscribeClear();
    };
  }, [setConsoles]);

  return null;
}
