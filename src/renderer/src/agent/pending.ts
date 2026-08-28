export const STOP_ANSWER = "__stopped__";

const waiters = new Map<string, (value: string | null) => void>();

export function waitForUser(id: string): Promise<string | null> {
  return new Promise((resolve) => {
    waiters.set(id, resolve);
  });
}

export function answerUser(id: string, value: string | null): void {
  const resolve = waiters.get(id);
  if (!resolve) return;

  waiters.delete(id);
  resolve(value);
}

function releaseAll(value: string | null): void {
  for (const [id, resolve] of [...waiters.entries()]) {
    waiters.delete(id);
    resolve(value);
  }
}

export function cancelAllWaiters(): void {
  releaseAll(null);
}

export function stopAllWaiters(): void {
  releaseAll(STOP_ANSWER);
}
