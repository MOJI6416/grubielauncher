import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const memory: Record<string, string> = {};
const accountsSave = vi.fn(async () => {});

beforeAll(() => {
  (globalThis as any).localStorage = {
    getItem: (key: string) => memory[key] ?? null,
    setItem: (key: string, value: string) => {
      memory[key] = value;
    },
    removeItem: (key: string) => {
      delete memory[key];
    },
  };
  (globalThis as any).window = {
    localStorage: (globalThis as any).localStorage,
    api: {
      accounts: { save: accountsSave },
      path: { join: async (...parts: string[]) => parts.join("/") },
      fs: { pathExists: async () => false },
      servers: { read: async () => [] },
      backend: { getModpack: async () => ({ status: "ok", data: null }) },
    },
  };
});

vi.mock("sonner", () => {
  const toast: any = vi.fn();
  toast.error = vi.fn();
  toast.success = vi.fn();
  toast.warning = vi.fn();
  toast.info = vi.fn();
  toast.loading = vi.fn();
  return { toast };
});

vi.mock("@renderer/i18n", () => ({
  default: { t: (key: string) => key, language: "en", resolvedLanguage: "en" },
}));

vi.mock("@renderer/utilities/errorToast", () => ({
  showErrorToast: vi.fn(),
  recordError: vi.fn(),
}));

vi.mock("@renderer/utilities/failures", () => ({
  showFailureToast: vi.fn(),
  reportIpcFailure: vi.fn(),
  pushIpcFailure: vi.fn(),
}));

vi.mock("@renderer/utilities/onlineSocket", () => ({
  isOnlineSocketConnected: () => false,
}));

vi.mock("@renderer/utilities/version", () => ({
  checkDiffenceUpdateData: vi.fn(async () => false),
  isOwner: () => true,
}));

type Fake = {
  version: Record<string, any>;
  versionPath: string;
  ensureAuthlib: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
};

function fakeInstance(overrides?: Partial<Fake>): Fake {
  return {
    version: {
      name: "Fabulously Optimized",
      loader: { name: "fabric", mods: [] },
      owner: "discord_moji6416",
      downloadedVersion: false,
      overrides: undefined,
    },
    versionPath: "C:/instances/fo",
    ensureAuthlib: vi.fn(async () => ({ ok: true })),
    run: vi.fn(async () => true),
    save: vi.fn(async () => {}),
    ...overrides,
  };
}

const account = { type: "plain", nickname: "moji6416" } as any;

async function load() {
  const [{ runGame }, atoms, launchAtoms, { getDefaultStore }] =
    await Promise.all([
      import("./runGame"),
      import("@renderer/stores/atoms"),
      import("./atoms"),
      import("jotai"),
    ]);

  return { runGame, atoms, launchAtoms, store: getDefaultStore() };
}

describe("runGame", () => {
  beforeEach(async () => {
    const { atoms, store } = await load();
    store.set(atoms.isRunningAtom, false);
    store.set(atoms.installActiveAtom, false);
    store.set(atoms.consolesAtom, { consoles: [] });
    store.set(atoms.accountAtom, account);
    store.set(atoms.accountsAtom, [account]);
    store.set(atoms.authDataAtom, null);
    store.set(atoms.selectedVersionAtom, undefined);
    store.set(atoms.pathsAtom, {
      launcher: "C:/launcher",
      minecraft: "C:/launcher/minecraft",
      java: "C:/launcher/java",
    });
    accountsSave.mockClear();
  });

  it("never raises the running flag when an install holds the lock", async () => {
    const { runGame, atoms, store } = await load();
    store.set(atoms.installActiveAtom, true);
    const instance = fakeInstance();

    await runGame({ version: instance as any });

    expect(store.get(atoms.isRunningAtom)).toBe(false);
    expect(instance.run).not.toHaveBeenCalled();
  });

  it("never raises the running flag without an instance", async () => {
    const { runGame, atoms, store } = await load();

    await runGame({});

    expect(store.get(atoms.isRunningAtom)).toBe(false);
  });

  it("never raises the running flag without an account", async () => {
    const { runGame, atoms, store } = await load();
    store.set(atoms.accountAtom, undefined);

    await runGame({ version: fakeInstance() as any });

    expect(store.get(atoms.isRunningAtom)).toBe(false);
  });

  it("lowers the running flag again when authlib is unavailable", async () => {
    const { runGame, atoms, store } = await load();
    const instance = fakeInstance({
      ensureAuthlib: vi.fn(async () => ({ ok: false, reason: "unavailable" })),
    });

    await runGame({ version: instance as any });

    expect(store.get(atoms.isRunningAtom)).toBe(false);
    expect(instance.run).not.toHaveBeenCalled();
  });

  it("lowers the running flag and marks the console when the process fails", async () => {
    const { runGame, atoms, store } = await load();
    const instance = fakeInstance({ run: vi.fn(async () => false) });

    await runGame({ version: instance as any });

    expect(store.get(atoms.isRunningAtom)).toBe(false);
    expect(store.get(atoms.consolesAtom).consoles[0].status).toBe("error");
  });

  it("leaves the running flag up after a successful start", async () => {
    const { runGame, atoms, store } = await load();
    const instance = fakeInstance();

    await runGame({ version: instance as any });

    expect(instance.run).toHaveBeenCalledTimes(1);
    expect(store.get(atoms.isRunningAtom)).toBe(true);
    expect(store.get(atoms.consolesAtom).consoles[0]).toMatchObject({
      versionName: "Fabulously Optimized",
      instance: 0,
      status: "running",
    });
    expect(accountsSave).toHaveBeenCalledTimes(1);
  });

  it("releases the in-flight lock so the next launch is not blocked", async () => {
    const { runGame, atoms, store } = await load();

    await runGame({ version: fakeInstance() as any });
    store.set(atoms.isRunningAtom, false);

    const second = fakeInstance();
    await runGame({ version: second as any });

    expect(second.run).toHaveBeenCalledTimes(1);
    expect(store.get(atoms.isRunningAtom)).toBe(true);
  });

  it("takes the next free instance slot", async () => {
    const { runGame, atoms, store } = await load();
    store.set(atoms.consolesAtom, {
      consoles: [
        {
          versionName: "Fabulously Optimized",
          instance: 0,
          status: "running",
          startTime: 0,
          messages: [],
        },
      ],
    });

    const instance = fakeInstance();
    await runGame({ version: instance as any });

    expect(instance.run).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      null,
      1,
      undefined,
    );
  });
});
