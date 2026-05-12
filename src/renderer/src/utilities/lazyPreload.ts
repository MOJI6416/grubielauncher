import { createElement, type ComponentProps, type ComponentType } from "react";

type PreloadTask = () => Promise<unknown>;

type IdleWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (
      callback: () => void,
      options?: { timeout?: number },
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

export function preload(task: PreloadTask) {
  void task().catch(() => {});
}

export function preloadAll(tasks: PreloadTask[]) {
  for (const task of tasks) preload(task);
}

export function schedulePreload(tasks: PreloadTask[], timeout = 1200) {
  let cancelled = false;
  const run = () => {
    if (!cancelled) preloadAll(tasks);
  };

  const idleWindow = window as IdleWindow;
  if (typeof idleWindow.requestIdleCallback === "function") {
    const handle = idleWindow.requestIdleCallback(run, { timeout });
    return () => {
      cancelled = true;
      idleWindow.cancelIdleCallback?.(handle);
    };
  }

  const handle = window.setTimeout(run, timeout);
  return () => {
    cancelled = true;
    window.clearTimeout(handle);
  };
}

export function lazyWithPreload<TComponent extends ComponentType<any>>(
  loader: () => Promise<{ default: TComponent }>,
) {
  let loadedModule: { default: TComponent } | null = null;
  let pendingPromise: Promise<{ default: TComponent }> | null = null;

  const load = () => {
    if (loadedModule) return Promise.resolve(loadedModule);

    if (!pendingPromise) {
      pendingPromise = loader().then((module) => {
        loadedModule = module;
        return module;
      });
    }

    return pendingPromise;
  };

  function PreloadableComponent(props: ComponentProps<TComponent>) {
    if (loadedModule) {
      return createElement(loadedModule.default, props);
    }

    throw load();
  }

  PreloadableComponent.preload = load;

  return PreloadableComponent as ComponentType<ComponentProps<TComponent>> & {
    preload: typeof load;
  };
}
