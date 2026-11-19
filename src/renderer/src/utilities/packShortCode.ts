import { useEffect, useState } from "react";

const api = window.api;

const known = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

export function rememberPackShortCode(
  shareCode: string,
  shortCode: string | null | undefined,
) {
  if (shareCode && shortCode) known.set(shareCode, shortCode);
}

export function resolvePackShortCode(shareCode: string): Promise<string | null> {
  if (known.has(shareCode)) return Promise.resolve(known.get(shareCode) ?? null);

  let request = pending.get(shareCode);
  if (!request) {
    request = api.backend
      .getModpack("", shareCode)
      .then((response) => {
        const shortCode =
          typeof response?.data?.shortCode === "string" &&
          response.data.shortCode
            ? response.data.shortCode
            : null;
        if (response?.status !== "error") known.set(shareCode, shortCode);
        return shortCode;
      })
      .catch(() => null)
      .finally(() => pending.delete(shareCode));
    pending.set(shareCode, request);
  }

  return request;
}

export function usePackShortCode(
  shareCode: string | undefined,
  stored?: string,
): string | undefined {
  const [shortCode, setShortCode] = useState<string | undefined>(
    () => stored || (shareCode ? (known.get(shareCode) ?? undefined) : undefined),
  );

  useEffect(() => {
    if (stored) {
      setShortCode(stored);
      return;
    }
    if (!shareCode) {
      setShortCode(undefined);
      return;
    }

    let active = true;
    void resolvePackShortCode(shareCode).then((value) => {
      if (active) setShortCode(value ?? undefined);
    });

    return () => {
      active = false;
    };
  }, [shareCode, stored]);

  return shortCode;
}
