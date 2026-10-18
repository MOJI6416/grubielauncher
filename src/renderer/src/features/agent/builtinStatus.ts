import { useEffect } from "react";
import { atom, useAtom, useAtomValue } from "jotai";
import { AgentBuiltinStatus } from "@/types/Agent";
import { accountAtom } from "@renderer/stores/atoms";

export const agentBuiltinStatusAtom = atom<AgentBuiltinStatus | null>(null);

export function useBuiltinStatus(
  active: boolean,
  running: boolean,
): AgentBuiltinStatus | null {
  const accessToken = useAtomValue(accountAtom)?.accessToken;
  const [status, setStatus] = useAtom(agentBuiltinStatusAtom);

  useEffect(() => {
    if (!active || running || !accessToken) return;

    let cancelled = false;
    void window.api.agent.builtin
      .status(accessToken)
      .catch(() => null)
      .then((next) => {
        if (!cancelled) setStatus(next);
      });

    return () => {
      cancelled = true;
    };
  }, [active, running, accessToken, setStatus]);

  return active ? status : null;
}

export function isBuiltinLocked(
  builtin: boolean | undefined,
  status: AgentBuiltinStatus | null,
): boolean {
  return Boolean(builtin) && status?.allowed === false;
}
