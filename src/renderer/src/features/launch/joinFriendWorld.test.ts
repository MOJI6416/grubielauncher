import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const memory: Record<string, string> = {};
const modsCheck = vi.fn(async () => {});
const runGameMock = vi.fn(async (..._args: unknown[]) => {});
const syncShareMock = vi.fn();
const checkBlockedModsMock = vi.fn();
const connectToFriendShare = vi.fn(async () => ({
  ok: true,
  data: { connectHost: "share.grubielauncher.com:25565" },
}));
const serversWrite = vi.fn(async () => true);
const showFailureToastMock = vi.fn();
const readInstanceServersMock = vi.fn(async (..._args: unknown[]) => [] as
  | { name: string; ip: string; acceptTextures: null }[]
  | null);

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
      path: { join: async (...parts: string[]) => parts.join("/") },
      servers: { read: async () => [], write: serversWrite },
      share: { connectToFriendShare },
      backend: {
        getModpack: async () => ({
          status: "ok",
          data: { build: 7, conf: { loader: { mods: [] }, servers: [] } },
        }),
      },
    },
  };
});

vi.mock("sonner", () => {
  const toast: any = vi.fn();
  toast.error = vi.fn();
  toast.success = vi.fn();
  toast.warning = vi.fn();
  toast.info = vi.fn();
  toast.loading = vi.fn(() => "toast-id");
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
  showFailureToast: (...args: unknown[]) => showFailureToastMock(...args),
  reportIpcFailure: vi.fn(() => false),
  pushIpcFailure: vi.fn(),
}));

vi.mock("@renderer/utilities/share", () => ({
  getShareErrorText: (t: (key: string) => string) => t("share.error"),
  getShareErrorDetails: () => "",
}));

vi.mock("@renderer/utilities/blockedMods", () => ({
  checkBlockedMods: (...args: unknown[]) => checkBlockedModsMock(...args),
  applyBlockedModFilePaths: () => true,
}));

vi.mock("@renderer/utilities/lazyPreload", () => ({
  preload: vi.fn(),
  lazyWithPreload: () => ({ preload: vi.fn() }),
}));

vi.mock("@renderer/utilities/version", () => ({
  syncShare: (...args: unknown[]) => syncShareMock(...args),
}));

vi.mock("@renderer/utilities/versionPure", () => ({
  supportsQuickPlayMultiplayer: () => true,
}));

vi.mock("@renderer/features/instances/instanceServers", () => ({
  readInstanceServers: (...args: unknown[]) => readInstanceServersMock(...args),
}));

vi.mock("@renderer/features/instances/newInstance", () => ({
  openNewInstance: vi.fn(),
}));

vi.mock("@renderer/classes/Mods", () => ({
  Mods: class {
    check = modsCheck;
  },
}));

vi.mock("./runGame", () => ({
  runGame: (...args: unknown[]) => runGameMock(...args),
}));

function fakeInstance(name: string, shareCode: string) {
  return {
    version: {
      name,
      shareCode,
      build: 3,
      downloadedVersion: true,
      loader: { name: "fabric", mods: [] },
      version: { id: "1.21.1" },
    },
    versionPath: `C:/instances/${name}`,
    isQuickPlayMultiplayer: true,
    save: vi.fn(async () => {}),
  };
}

async function load() {
  const [{ joinFriendWorld }, atoms, launchAtoms, { getDefaultStore }] =
    await Promise.all([
      import("./joinFriendWorld"),
      import("@renderer/stores/atoms"),
      import("./atoms"),
      import("jotai"),
    ]);

  return { joinFriendWorld, atoms, launchAtoms, store: getDefaultStore() };
}

describe("joinFriendWorld with blocked mods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkBlockedModsMock.mockReset();
    serversWrite.mockResolvedValue(true);
    readInstanceServersMock.mockResolvedValue([]);
  });

  it("resumes the join after the blocked mods dialog instead of leaving it to the selected instance", async () => {
    const { joinFriendWorld, atoms, launchAtoms, store } = await load();

    const friendPack = fakeInstance("Friend Pack", "SHARE-1");
    const other = fakeInstance("Совсем другая сборка", "SHARE-OTHER");

    store.set(atoms.versionsAtom, [friendPack, other] as never);
    store.set(atoms.selectedVersionAtom, other as never);
    store.set(atoms.accountAtom, { accessToken: "token" } as never);
    store.set(atoms.consolesAtom, { consoles: [] });
    store.set(launchAtoms.blockedModsOpenAtom, false);
    store.set(launchAtoms.blockedModsResumeAtom, null);

    syncShareMock.mockResolvedValue(friendPack);
    checkBlockedModsMock
      .mockResolvedValueOnce({
        blockedMods: [
          {
            projectId: "jei",
            fileId: 1,
            fileName: "jei.jar",
            hash: "",
            url: "blocked::x",
          },
        ],
        mods: [],
      })
      .mockResolvedValue({ blockedMods: [], mods: [] });

    await joinFriendWorld({
      versionCode: "SHARE-1",
      hostNickname: "Kituk",
      slug: "abc",
    });

    expect(store.get(launchAtoms.blockedModsOpenAtom)).toBe(true);
    expect(runGameMock).not.toHaveBeenCalled();

    const resume = store.get(launchAtoms.blockedModsResumeAtom);
    expect(resume).not.toBeNull();

    await resume!.run([
      {
        projectId: "jei",
        fileId: 1,
        fileName: "jei.jar",
        hash: "",
        url: "blocked::x",
        filePath: "C:/downloads/jei.jar",
      },
    ]);

    expect(modsCheck).toHaveBeenCalledTimes(1);
    expect(runGameMock).toHaveBeenCalledTimes(1);
    expect(runGameMock.mock.calls[0]?.[0]).toMatchObject({
      version: friendPack,
      quick: { multiplayer: "share.grubielauncher.com:25565" },
    });
  });

  it("does not launch anything when the blocked mods dialog is cancelled", async () => {
    const { joinFriendWorld, atoms, launchAtoms, store } = await load();

    const friendPack = fakeInstance("Friend Pack", "SHARE-1");
    const other = fakeInstance("Совсем другая сборка", "SHARE-OTHER");

    store.set(atoms.versionsAtom, [friendPack, other] as never);
    store.set(atoms.selectedVersionAtom, other as never);
    store.set(atoms.accountAtom, { accessToken: "token" } as never);
    store.set(atoms.consolesAtom, { consoles: [] });
    store.set(launchAtoms.blockedModsResumeAtom, null);

    syncShareMock.mockResolvedValue(friendPack);
    checkBlockedModsMock.mockResolvedValue({
      blockedMods: [
        {
          projectId: "jei",
          fileId: 1,
          fileName: "jei.jar",
          hash: "",
          url: "blocked::x",
        },
      ],
      mods: [],
    });

    await joinFriendWorld({
      versionCode: "SHARE-1",
      hostNickname: "Kituk",
      slug: "abc",
    });

    const resume = store.get(launchAtoms.blockedModsResumeAtom);
    await resume!.run(null);

    expect(modsCheck).not.toHaveBeenCalled();
    expect(runGameMock).not.toHaveBeenCalled();
  });

  it("says so when the host sync leaves the player without their own servers", async () => {
    const { joinFriendWorld, atoms, store } = await load();

    const friendPack = fakeInstance("Friend Pack", "SHARE-1");
    store.set(atoms.versionsAtom, [friendPack] as never);
    store.set(atoms.accountAtom, { accessToken: "token" } as never);
    store.set(atoms.consolesAtom, { consoles: [] });

    syncShareMock.mockResolvedValue(friendPack);
    checkBlockedModsMock.mockResolvedValue({ blockedMods: [], mods: [] });
    readInstanceServersMock.mockResolvedValue(null);

    await joinFriendWorld({
      versionCode: "SHARE-1",
      hostNickname: "Kituk",
      slug: "abc",
    });

    expect(showFailureToastMock).toHaveBeenCalledWith(
      "friends.joinFlow.ownServersLost",
      undefined,
      expect.objectContaining({ channels: ["servers:write", "servers:read"] }),
    );
    expect(runGameMock).toHaveBeenCalledTimes(1);
  });

  it("says so when restoring the player's own servers cannot be written", async () => {
    const { joinFriendWorld, atoms, store } = await load();

    const friendPack = fakeInstance("Friend Pack", "SHARE-1");
    store.set(atoms.versionsAtom, [friendPack] as never);
    store.set(atoms.accountAtom, { accessToken: "token" } as never);
    store.set(atoms.consolesAtom, { consoles: [] });

    syncShareMock.mockResolvedValue(friendPack);
    checkBlockedModsMock.mockResolvedValue({ blockedMods: [], mods: [] });
    readInstanceServersMock
      .mockResolvedValueOnce([
        { name: "Мой сервер", ip: "my.server:25565", acceptTextures: null },
      ])
      .mockResolvedValue([
        { name: "Сервер сборки", ip: "host.server:25565", acceptTextures: null },
      ]);
    serversWrite.mockResolvedValue(false);

    await joinFriendWorld({
      versionCode: "SHARE-1",
      hostNickname: "Kituk",
      slug: "abc",
    });

    expect(serversWrite).toHaveBeenCalled();
    expect(showFailureToastMock).toHaveBeenCalledWith(
      "friends.joinFlow.ownServersLost",
      undefined,
      expect.objectContaining({ channels: ["servers:write", "servers:read"] }),
    );
  });
});
