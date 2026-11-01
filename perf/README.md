# Performance stand

Runs the built launcher (`out/`) on isolated data, walks through every screen, and checks the results against the budgets in `budgets.json`.

## Requirements

- Windows: the stand backs up and restores the `grubielauncher://` protocol registration through `reg`, and generates its certificate with `openssl` (the one bundled with Git for Windows is enough).
- A seed stand with `data/` and `userData/`. Defaults to `%LOCALAPPDATA%\grubie-stand\shots`; override it with `PERF_SEED`. The seed is not part of the repository.
- Ports 443, 8079, 9341 and 9342 must be free, so only one run can go at a time.

## Usage

```bash
npx electron-vite build
npm run perf -- --label after
node perf/check.mjs after
npm run perf:compare -- before after
```

`run.mjs` options:

- `--tours 4` — rounds of the screen tour;
- `--cold 3`, `--warm 5` — cold and warm startups;
- `--memoryRounds 5` — rounds of the memory pass;
- `--only nav.,instance.` — run only the steps with these prefixes;
- `--idle 3000` — how long the app sits idle after startup before the tour begins;
- `--skipStartup`, `--skipTour`, `--skipMemory`.

Results go to `perf/results/<label>.json`, which is not tracked by git. `check.mjs` prints a result against the budgets and exits with code 1 if any budget fails. `compare.mjs` writes `perf/results/compare-<before>-<after>.md`.

## How the stand works

- **Data.** The seed is copied to `%LOCALAPPDATA%\grubie-stand\perf`, and a generated "Mega Pack" instance with 450 mods is added. Your own launcher data is never touched.
- **Network.** `fake-api.mjs` answers every request: friends and chats over socket.io, news, the leaderboard, the Mojang manifest, Modrinth and images. The renderer reaches it through `--host-resolver-rules`, the main process through `HTTPS_PROXY`. Nothing is sent to production.
- **Window.** It opens off-screen with `showInactive` and never takes focus. Game launch and install are disabled for the run.
- **Late CDP attach.** Playwright connects only after the first render, because attaching early breaks the sandboxed preload (`window.api` never appears). Startup timings come from a probe injected into the main process through `--inspect`.

## Metrics

- **ready** — from input until the screen's content is shown.
- **settle** — from input until the last DOM change followed by 300 ms of quiet. For typing it counts from the last keystroke.
- **inp** — Event Timing: from a click or key press to the next paint.
- **tbt** and **maxFrame** — total blocking time and the longest frame, from Long Animation Frames.
- **cold / warm** — the first visit to a screen in a session, and the median of the later visits.
- **Memory** is measured in a separate pass that uses a plain `element.click()`. Playwright locators retain DOM nodes themselves and would inflate the counters.

## Budgets

`budgets.json` holds limits for startup, memory and every tour step. Values are in milliseconds unless the key says otherwise (`privateMB`, `heapMB`, `nodes`, `listeners`, `p95Frame`, `over33Pct`).

- `defaults` set the limits for each kind of step: `nav`, `typing` and `frames`.
- `steps` override them for one step, for example the home screen's count-up animation or the network-bound servers tab.
- `memory.growth` compares the first and the last round of the memory pass.

When a change makes a screen legitimately heavier, update its budget in the same commit and say why.

## Diagnostics

- `node perf/trace-startup.mjs [--cold]` — the IPC waterfall up to the ready home screen, plus a CPU profile of the main process.
- `node perf/profile.mjs --step <id> [--cold]` — a CPU profile of one tour step. Use `--step reload` for a renderer profile of a page reload.

Build with `npx electron-vite build --sourcemap` to map profiles back to source files.
