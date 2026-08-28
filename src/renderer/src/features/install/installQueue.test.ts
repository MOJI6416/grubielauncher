import { describe, expect, it, vi } from "vitest";
import { VERSION_INSTALL_CANCELLED } from "@/types/InstallationProgress";
import { InstallQueue, InstallQueueState } from "./installQueue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function meta(queue: InstallQueue, label: string) {
  return { id: queue.nextId(), label, loaderName: "fabric" as const };
}

describe("InstallQueue", () => {
  it("runs a single task and reports it as active", async () => {
    const queue = new InstallQueue();
    const states: InstallQueueState[] = [];
    queue.subscribe((state) => states.push(state));

    const gate = deferred<string>();
    const promise = queue.run(meta(queue, "A"), () => gate.promise);

    await Promise.resolve();
    expect(queue.getState().active?.label).toBe("A");

    gate.resolve("ok");
    await expect(promise).resolves.toBe("ok");
    expect(queue.getState()).toEqual({ active: null, pending: [] });
    expect(states[0]).toEqual({ active: null, pending: [] });
  });

  it("never runs two tasks at once", async () => {
    const queue = new InstallQueue();
    const first = deferred<void>();
    const second = vi.fn(() => Promise.resolve());

    const firstPromise = queue.run(meta(queue, "A"), () => first.promise);
    const secondPromise = queue.run(meta(queue, "B"), second);

    await Promise.resolve();
    expect(second).not.toHaveBeenCalled();
    expect(queue.getState().active?.label).toBe("A");
    expect(queue.getState().pending.map((item) => item.label)).toEqual(["B"]);

    first.resolve();
    await firstPromise;
    await secondPromise;

    expect(second).toHaveBeenCalledTimes(1);
    expect(queue.getState()).toEqual({ active: null, pending: [] });
  });

  it("keeps draining after a task throws", async () => {
    const queue = new InstallQueue();
    const failing = queue.run(meta(queue, "A"), () =>
      Promise.reject(new Error("boom")),
    );
    const following = queue.run(meta(queue, "B"), () => Promise.resolve(7));

    await expect(failing).rejects.toThrow("boom");
    await expect(following).resolves.toBe(7);
  });

  it("cancels a pending task without touching the active one", async () => {
    const queue = new InstallQueue();
    const gate = deferred<void>();
    const activeMeta = meta(queue, "A");
    const pendingMeta = meta(queue, "B");

    const activePromise = queue.run(activeMeta, () => gate.promise);
    const pendingPromise = queue.run(pendingMeta, () => Promise.resolve());

    await Promise.resolve();
    expect(queue.cancelPending(pendingMeta.id)).toBe(true);
    await expect(pendingPromise).rejects.toThrow(VERSION_INSTALL_CANCELLED);
    expect(queue.getState().pending).toEqual([]);

    gate.resolve();
    await expect(activePromise).resolves.toBeUndefined();
  });

  it("refuses to cancel an unknown or already active task", async () => {
    const queue = new InstallQueue();
    const gate = deferred<void>();
    const activeMeta = meta(queue, "A");
    const promise = queue.run(activeMeta, () => gate.promise);

    await Promise.resolve();
    expect(queue.cancelPending(activeMeta.id)).toBe(false);
    expect(queue.cancelPending("nope")).toBe(false);

    gate.resolve();
    await promise;
  });

  it("stops notifying after unsubscribe", async () => {
    const queue = new InstallQueue();
    const listener = vi.fn();
    const unsubscribe = queue.subscribe(listener);

    unsubscribe();
    await queue.run(meta(queue, "A"), () => Promise.resolve());

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("reports how each task settled", async () => {
    const queue = new InstallQueue();
    const settled: Array<{ label: string; failed: boolean }> = [];
    queue.subscribeSettled((event) =>
      settled.push({ label: event.meta.label, failed: Boolean(event.error) }),
    );

    await queue.run(meta(queue, "A"), () => Promise.resolve());
    await queue
      .run(meta(queue, "B"), () => Promise.reject(new Error("boom")))
      .catch(() => {});

    expect(settled).toEqual([
      { label: "A", failed: false },
      { label: "B", failed: true },
    ]);
  });

  it("drops a pending task when its signal aborts", async () => {
    const queue = new InstallQueue();
    const active = deferred<void>();
    const controller = new AbortController();

    const first = queue.run(meta(queue, "A"), () => active.promise);
    const second = queue.run(
      meta(queue, "B"),
      () => Promise.resolve("done"),
      controller.signal,
    );

    expect(queue.getState().pending.map((task) => task.label)).toEqual(["B"]);

    controller.abort();
    await expect(second).rejects.toThrow(VERSION_INSTALL_CANCELLED);
    expect(queue.getState().pending).toEqual([]);

    active.resolve();
    await first;
  });

  it("refuses a task whose signal is already aborted", async () => {
    const queue = new InstallQueue();
    const task = vi.fn(() => Promise.resolve());

    await expect(
      queue.run(meta(queue, "A"), task, AbortSignal.abort()),
    ).rejects.toThrow(VERSION_INSTALL_CANCELLED);
    expect(task).not.toHaveBeenCalled();
  });

  it("hands out unique ids", () => {
    const queue = new InstallQueue();
    expect(queue.nextId()).not.toBe(queue.nextId());
  });
});
