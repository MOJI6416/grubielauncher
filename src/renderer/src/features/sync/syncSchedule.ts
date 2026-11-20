const LOCAL_CHANGE_DELAY_MS = 4000;

let runner: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export function setAccountSyncRunner(next: (() => void) | null): void {
  runner = next;
}

export function scheduleAccountSync(delay = LOCAL_CHANGE_DELAY_MS): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    runner?.();
  }, delay);
}
