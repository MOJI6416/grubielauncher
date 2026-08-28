import { VERSION_INSTALL_CANCELLED } from "@/types/InstallationProgress";
import { Loader } from "@/types/Loader";

export interface InstallTaskMeta {
  id: string;
  label: string;
  loaderName: Loader;
}

export interface InstallQueueState {
  active: InstallTaskMeta | null;
  pending: InstallTaskMeta[];
}

interface QueueJob {
  meta: InstallTaskMeta;
  run: () => Promise<unknown>;
  resolve: (value: never) => void;
  reject: (reason: unknown) => void;
}

export interface InstallQueueSettled {
  meta: InstallTaskMeta;
  error: unknown;
}

export class InstallQueue {
  private activeJob: QueueJob | null = null;
  private pendingJobs: QueueJob[] = [];
  private listeners = new Set<(state: InstallQueueState) => void>();
  private settleListeners = new Set<(event: InstallQueueSettled) => void>();
  private counter = 0;

  nextId(prefix = "task"): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  getState(): InstallQueueState {
    return {
      active: this.activeJob?.meta ?? null,
      pending: this.pendingJobs.map((job) => job.meta),
    };
  }

  subscribe(listener: (state: InstallQueueState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeSettled(
    listener: (event: InstallQueueSettled) => void,
  ): () => void {
    this.settleListeners.add(listener);
    return () => {
      this.settleListeners.delete(listener);
    };
  }

  run<T>(
    meta: InstallTaskMeta,
    task: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error(VERSION_INSTALL_CANCELLED));
        return;
      }

      this.pendingJobs.push({
        meta,
        run: task as () => Promise<unknown>,
        resolve: resolve as (value: never) => void,
        reject,
      });

      if (signal) {
        signal.addEventListener(
          "abort",
          () => this.cancelPending(meta.id),
          { once: true },
        );
      }

      this.emit();
      void this.drain();
    });
  }

  cancelPending(id: string): boolean {
    const index = this.pendingJobs.findIndex((job) => job.meta.id === id);
    if (index === -1) return false;

    const [job] = this.pendingJobs.splice(index, 1);
    job.reject(new Error(VERSION_INSTALL_CANCELLED));
    this.emit();
    return true;
  }

  private emit(): void {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
  }

  private async drain(): Promise<void> {
    if (this.activeJob) return;

    const job = this.pendingJobs.shift();
    if (!job) return;

    this.activeJob = job;
    this.emit();

    let failure: unknown = null;

    try {
      const value = await job.run();
      job.resolve(value as never);
    } catch (error) {
      failure = error;
      job.reject(error);
    } finally {
      this.activeJob = null;
      for (const listener of this.settleListeners) {
        listener({ meta: job.meta, error: failure });
      }
      this.emit();
      void this.drain();
    }
  }
}

export const installQueue = new InstallQueue();
