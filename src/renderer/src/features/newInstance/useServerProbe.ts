import { useCallback, useRef, useState } from "react";
import { serverIconDataUrl } from "@renderer/features/servers/serverIcon";
import { pingServer } from "@renderer/features/servers/useServerStatuses";
import { minecraftVersionFromPing, parseServerAddress } from "./serverTarget";

export interface ServerProbe {
  status: "idle" | "probing" | "online" | "offline";
  address: string;
  host: string;
  motd?: string;
  versionName?: string;
  minecraftVersion: string | null;
  players?: { online: number; max: number };
  latencyMs?: number;
  modded?: boolean;
  favicon?: string;
}

const IDLE: ServerProbe = {
  status: "idle",
  address: "",
  host: "",
  minecraftVersion: null,
};

export function useServerProbe() {
  const [probe, setProbe] = useState<ServerProbe>(IDLE);
  const requestRef = useRef(0);

  const reset = useCallback(() => {
    requestRef.current += 1;
    setProbe(IDLE);
  }, []);

  const run = useCallback(async (raw: string) => {
    const target = parseServerAddress(raw);
    const requestId = ++requestRef.current;

    if (!target) {
      setProbe({ ...IDLE, status: "offline", address: raw.trim() });
      return;
    }

    setProbe({
      ...IDLE,
      status: "probing",
      address: target.address,
      host: target.host,
    });

    const result = (await pingServer(target.address).catch(() => null))?.result;
    if (requestId !== requestRef.current) return;

    if (!result?.online) {
      setProbe({
        ...IDLE,
        status: "offline",
        address: target.address,
        host: target.host,
      });
      return;
    }

    setProbe({
      status: "online",
      address: target.address,
      host: target.host,
      motd: result.motd,
      versionName: result.versionName,
      minecraftVersion: minecraftVersionFromPing(result.versionName),
      players: result.players
        ? { online: result.players.online, max: result.players.max }
        : undefined,
      latencyMs: result.latencyMs,
      modded: result.modded,
      favicon: serverIconDataUrl(result.favicon),
    });
  }, []);

  return { probe, run, reset };
}
