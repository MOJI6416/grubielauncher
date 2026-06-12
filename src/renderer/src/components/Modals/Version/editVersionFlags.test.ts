import { describe, expect, it } from "vitest";
import { EditVersionFlagsInput, getEditVersionFlags } from "./editVersionFlags";

function input(
  override: Partial<EditVersionFlagsInput> = {},
): EditVersionFlagsInput {
  return {
    hasVersion: true,
    shareCode: undefined,
    downloadedVersion: false,
    owner: "discord_host",
    loaderName: "vanilla",
    hasAccount: true,
    isOwnerVersion: true,
    versionDiffence: "sync",
    isInternetOnline: true,
    isNetwork: true,
    ...override,
  };
}

describe("getEditVersionFlags", () => {
  it("offers sharing only for unshared versions", () => {
    expect(getEditVersionFlags(input()).showShareAction).toBe(true);
    expect(
      getEditVersionFlags(input({ shareCode: "abc" })).showShareAction,
    ).toBe(false);
  });

  it("offers share management to the owner of a shared version", () => {
    const flags = getEditVersionFlags(input({ shareCode: "abc" }));
    expect(flags.showShareManagementAction).toBe(true);

    const downloaded = getEditVersionFlags(
      input({ shareCode: "abc", downloadedVersion: true }),
    );
    expect(downloaded.showShareManagementAction).toBe(false);
  });

  it("offers publish only when local changes are ahead", () => {
    expect(
      getEditVersionFlags(input({ shareCode: "abc", versionDiffence: "new" }))
        .showPublishActions,
    ).toBe(true);
    expect(
      getEditVersionFlags(input({ shareCode: "abc", versionDiffence: "sync" }))
        .showPublishActions,
    ).toBe(false);
  });

  it("offers sync only for outdated downloaded versions", () => {
    expect(
      getEditVersionFlags(
        input({
          shareCode: "abc",
          downloadedVersion: true,
          versionDiffence: "old",
        }),
      ).showSyncAction,
    ).toBe(true);
  });

  it("blocks renaming foreign versions", () => {
    expect(
      getEditVersionFlags(input({ isOwnerVersion: false })).canRenameVersion,
    ).toBe(false);
    expect(
      getEditVersionFlags(
        input({ isOwnerVersion: false, downloadedVersion: true }),
      ).canRenameVersion,
    ).toBe(true);
  });

  it("requires the backend for forge server cores when offline", () => {
    expect(
      getEditVersionFlags(input({ loaderName: "forge", isNetwork: false }))
        .canFetchServerCore,
    ).toBe(false);
    expect(
      getEditVersionFlags(input({ loaderName: "fabric", isNetwork: false }))
        .canFetchServerCore,
    ).toBe(true);
  });
});
