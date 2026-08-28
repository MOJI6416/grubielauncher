import { describe, expect, it } from "vitest";
import {
  InstanceActionFlagsInput,
  getInstanceActionFlags,
} from "./instanceActionFlags";

function input(
  override: Partial<InstanceActionFlagsInput> = {},
): InstanceActionFlagsInput {
  return {
    hasVersion: true,
    shareCode: undefined,
    downloadedVersion: false,
    owner: "discord_host",
    loaderName: "vanilla",
    hasAccount: true,
    isOwnerVersion: true,
    versionDiffence: "sync",
    hasPublishDiff: false,
    isInternetOnline: true,
    isNetwork: true,
    ...override,
  };
}

describe("getInstanceActionFlags", () => {
  it("offers sharing only for unshared versions", () => {
    expect(getInstanceActionFlags(input()).showShareAction).toBe(true);
    expect(
      getInstanceActionFlags(input({ shareCode: "abc" })).showShareAction,
    ).toBe(false);
  });

  it("offers share management to the owner of a shared version", () => {
    const flags = getInstanceActionFlags(input({ shareCode: "abc" }));
    expect(flags.showShareManagementAction).toBe(true);

    const downloaded = getInstanceActionFlags(
      input({ shareCode: "abc", downloadedVersion: true }),
    );
    expect(downloaded.showShareManagementAction).toBe(false);
  });

  it("offers publish only when local changes are ahead", () => {
    expect(
      getInstanceActionFlags(input({ shareCode: "abc", hasPublishDiff: true }))
        .showPublishActions,
    ).toBe(true);
    expect(
      getInstanceActionFlags(input({ shareCode: "abc", hasPublishDiff: false }))
        .showPublishActions,
    ).toBe(false);
  });

  it("offers sync only for outdated downloaded versions", () => {
    expect(
      getInstanceActionFlags(
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
      getInstanceActionFlags(input({ isOwnerVersion: false })).canRenameVersion,
    ).toBe(false);
    expect(
      getInstanceActionFlags(
        input({ isOwnerVersion: false, downloadedVersion: true }),
      ).canRenameVersion,
    ).toBe(true);
  });

  it("requires the backend for forge server cores when offline", () => {
    expect(
      getInstanceActionFlags(input({ loaderName: "forge", isNetwork: false }))
        .canFetchServerCore,
    ).toBe(false);
    expect(
      getInstanceActionFlags(input({ loaderName: "fabric", isNetwork: false }))
        .canFetchServerCore,
    ).toBe(true);
  });
});
