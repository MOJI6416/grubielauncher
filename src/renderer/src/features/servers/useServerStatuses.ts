import { useEffect, useState } from "react";
import { runWithConcurrency } from "./ping";
import { isStatusFresh, pickStaleAddresses } from "./serverStatusCache";
import { ServerPingState, toPingState } from "./types";

const api = window.api;

const PING_CONCURRENCY = 3;

const cache = new Map<string, ServerPingState>();
const pending = new Map<string, Promise<ServerPingState>>();
const listeners = new Set<() => void>();

function snapshot(): Record<string, ServerPingState> {
  return Object.fromEntries(cache);
}

function publish(): void {
  for (const listener of listeners) listener();
}

function runPing(address: string): Promise<ServerPingState> {
  const existing = pending.get(address);
  if (existing) return existing;

  const task = api.servers
    .ping(address)
    .catch(() => ({ online: false, error: "unknown" }))
    .then((result) => {
      const state = toPingState(result);
      cache.set(address, state);
      pending.delete(address);
      publish();
      return state;
    });

  pending.set(address, task);

  return task;
}

export function forgetServerStatuses(): void {
  cache.clear();
  publish();
}

export function pingServer(address: string): Promise<ServerPingState> {
  const cached = cache.get(address);
  if (cached && isStatusFresh(cached, Date.now()))
    return Promise.resolve(cached);

  return runPing(address);
}

export function useServerStatuses(
  addresses: string[],
  enabled = true,
): Record<string, ServerPingState> {
  const [statuses, setStatuses] = useState<Record<string, ServerPingState>>(
    () => snapshot(),
  );
  const addressKey = addresses.filter(Boolean).join("|");

  useEffect(() => {
    const listener = () => setStatuses(snapshot());
    listeners.add(listener);
    listener();

    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const targets = pickStaleAddresses(
      addressKey ? addressKey.split("|") : [],
      snapshot(),
      new Set(pending.keys()),
      Date.now(),
    );
    if (!targets.length) return;

    void runWithConcurrency(targets, PING_CONCURRENCY, runPing);
  }, [addressKey, enabled]);

  return statuses;
}
