import { useEffect, useState } from "react";
import type { IModpack } from "@/types/Backend";
import { ignoreFailure } from "./ignoreFailure";

const api = window.api;

const known = new Map<string, IModpack | null>();
const pending = new Map<string, Promise<IModpack | null>>();

export function resolvePackManifest(code: string): Promise<IModpack | null> {
  if (known.has(code)) return Promise.resolve(known.get(code) ?? null);

  let request = pending.get(code);
  if (!request) {
    request = api.backend
      .getModpack("", code)
      .then((response) => {
        const manifest = response?.data ?? null;
        if (response?.status !== "error") known.set(code, manifest);
        return manifest;
      })
      .catch(ignoreFailure)
      .then((manifest) => manifest ?? null)
      .finally(() => pending.delete(code));
    pending.set(code, request);
  }

  return request;
}

export function resolvePackShortCode(shareCode: string): Promise<string | null> {
  return resolvePackManifest(shareCode).then(
    (manifest) => manifest?.shortCode || null,
  );
}

export function usePackManifest(
  code: string | undefined,
): IModpack | null | undefined {
  const [state, setState] = useState<{
    code: string | undefined;
    value: IModpack | null | undefined;
  }>(() => ({ code, value: code ? known.get(code) : undefined }));

  useEffect(() => {
    if (!code) {
      setState({ code, value: undefined });
      return;
    }
    if (known.has(code)) {
      setState({ code, value: known.get(code) ?? null });
      return;
    }

    let active = true;
    void resolvePackManifest(code).then((value) => {
      if (active) setState({ code, value });
    });

    return () => {
      active = false;
    };
  }, [code]);

  return state.code === code ? state.value : undefined;
}

export function usePackShortCode(
  shareCode: string | undefined,
  stored?: string,
): string | undefined {
  const manifest = usePackManifest(stored ? undefined : shareCode);
  return stored || manifest?.shortCode || undefined;
}
