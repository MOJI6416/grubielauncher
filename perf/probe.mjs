function installProbe() {
  if (window.__perf) return true;
  const state = { loaf: [], events: [], lastMutation: performance.now(), lastInput: 0, mark: 0, frames: null };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      state.loaf.push({
        start: entry.startTime,
        duration: entry.duration,
        blocking: entry.blockingDuration,
        scripts: entry.scripts.map((script) => ({
          duration: script.duration,
          invoker: String(script.invoker || "").slice(0, 80),
          source: String(script.sourceURL || "").split("/").pop(),
          fn: script.sourceFunctionName || "",
        })),
      });
    }
    if (state.loaf.length > 4000) state.loaf.splice(0, 2000);
  }).observe({ type: "long-animation-frame", buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      state.events.push({ name: entry.name, start: entry.startTime, duration: entry.duration, interaction: entry.interactionId });
    }
    if (state.events.length > 4000) state.events.splice(0, 2000);
  }).observe({ type: "event", durationThreshold: 16, buffered: true });
  new MutationObserver(() => {
    state.lastMutation = performance.now();
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  for (const type of ["pointerdown", "keydown", "wheel"]) {
    addEventListener(type, (event) => {
      if (!state.lastInput) state.lastInput = event.timeStamp;
      state.latestInput = event.timeStamp;
    }, { capture: true, passive: true });
  }

  function isReady(ready) {
    if (!ready) return true;
    const root = ready.within ? document.querySelector(ready.within) : document;
    if (!root) return false;
    if (ready.absent && root.querySelector(ready.absent)) return false;
    if (ready.selector && root.querySelectorAll(ready.selector).length < (ready.min ?? 1)) return false;
    if (ready.text && !(root.textContent || "").toLowerCase().includes(ready.text.toLowerCase())) return false;
    return true;
  }

  function summarize(from, to) {
    const frames = state.loaf.filter((entry) => entry.start + entry.duration > from && entry.start < to);
    const scripts = new Map();
    for (const frame of frames) {
      for (const script of frame.scripts) {
        const key = `${script.source}:${script.fn || script.invoker}`;
        scripts.set(key, (scripts.get(key) || 0) + script.duration);
      }
    }
    return {
      tbt: Math.round(frames.reduce((sum, frame) => sum + frame.blocking, 0)),
      maxFrame: Math.round(frames.reduce((max, frame) => Math.max(max, frame.duration), 0)),
      longFrames: frames.length,
      topScripts: [...scripts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key, duration]) => `${key} ${Math.round(duration)}`),
    };
  }

  window.__perf = {
    state,
    mark() {
      state.mark = performance.now();
      state.lastInput = 0;
      state.latestInput = 0;
      state.readyAt = 0;
      state.watching = true;
      const watch = () => {
        if (!state.watching) return;
        if (!state.readyAt && state.ready !== undefined && isReady(state.ready)) state.readyAt = performance.now();
        requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
      return state.mark;
    },
    arm(ready) {
      state.ready = ready ?? null;
    },
    isReady,
    async settle({ ready, quiet = 300, timeout = 10000, fromLastInput = false } = {}) {
      const started = state.mark;
      let timedOut = false;
      const origin = () => (fromLastInput ? state.latestInput : state.lastInput) || started;
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 16));
        const now = performance.now();
        if (!state.readyAt && isReady(ready)) state.readyAt = now;
        if (state.readyAt && now - Math.max(state.lastMutation, origin()) >= quiet) break;
        if (now - started > timeout) {
          timedOut = true;
          break;
        }
      }
      state.watching = false;
      const t0 = origin();
      const firstInput = state.lastInput || started;
      const end = Math.max(state.lastMutation, t0);
      const inputEvents = state.events.filter(
        (entry) => entry.start >= firstInput - 2 && entry.start <= end && /^(pointer|mouse|click|key)/.test(entry.name),
      );
      return {
        ready: state.readyAt ? Math.max(0, Math.round(state.readyAt - t0)) : null,
        settle: Math.round(end - t0),
        inp: Math.round(inputEvents.reduce((max, entry) => Math.max(max, entry.duration), 0)),
        timedOut,
        ...summarize(firstInput, end + 50),
      };
    },
    startFrames() {
      state.frames = [];
      let last = performance.now();
      const tick = (now) => {
        if (!state.frames) return;
        state.frames.push(now - last);
        last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      return (state.framesFrom = performance.now());
    },
    stopFrames() {
      const deltas = state.frames || [];
      state.frames = null;
      const sorted = [...deltas].sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
      const share = (limit) => (deltas.length ? Math.round((deltas.filter((delta) => delta > limit).length / deltas.length) * 1000) / 10 : 0);
      return {
        frames: deltas.length,
        p95Frame: Math.round(p95 * 10) / 10,
        maxFrameDelta: Math.round(sorted[sorted.length - 1] || 0),
        over17Pct: share(17.5),
        over33Pct: share(34),
        ...summarize(state.framesFrom, performance.now()),
      };
    },
  };
  return true;
}

export async function ensureProbe(page) {
  await page.evaluate(installProbe);
}

export async function measureStep(page, action, options = {}) {
  await ensureProbe(page);
  await page.evaluate((ready) => {
    window.__perf.arm(ready);
    window.__perf.mark();
  }, options.ready ?? null);
  await action();
  return page.evaluate((opts) => window.__perf.settle(opts), options);
}

export async function measureFrames(page, action) {
  await ensureProbe(page);
  await page.evaluate(() => window.__perf.startFrames());
  await action();
  return page.evaluate(() => window.__perf.stopFrames());
}

export async function waitReady(page, ready, timeout = 15000) {
  await ensureProbe(page);
  await page.waitForFunction((r) => window.__perf.isReady(r), ready, { timeout, polling: 50 });
}

export async function heap(cdp) {
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.collectGarbage");
  const usage = await cdp.send("Runtime.getHeapUsage");
  const dom = await cdp.send("Memory.getDOMCounters");
  return {
    heapMB: Math.round((usage.usedSize / 1048576) * 10) / 10,
    nodes: dom.nodes,
    listeners: dom.jsEventListeners,
    documents: dom.documents,
  };
}

export async function processMemory(main) {
  return main(`({ app }) => {
    const byType = {};
    let total = 0;
    let privateTotal = 0;
    for (const metric of app.getAppMetrics()) {
      const ws = metric.memory.workingSetSize / 1024;
      const priv = (metric.memory.privateBytes || 0) / 1024;
      const key = metric.type === "Utility" ? metric.serviceName || "Utility" : metric.type;
      byType[key] = Math.round((byType[key] || 0) + priv);
      total += ws;
      privateTotal += priv;
    }
    return { workingSetMB: Math.round(total), privateMB: Math.round(privateTotal), byType, mainHeapMB: Math.round(process.memoryUsage().heapUsed / 1048576) };
  }`);
}
