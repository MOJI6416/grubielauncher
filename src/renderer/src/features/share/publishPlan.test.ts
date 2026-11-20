import { describe, expect, it } from "vitest";
import {
  emptyPublishSelection,
  findModpackOtherPaths,
  formatFileList,
  getPublishFields,
  isOtherOverLimit,
  localModsFailureFiles,
  LocalModsUploadError,
  MAX_OTHER_BYTES,
  orphanedPublishUploads,
  pickNewPublishDefaults,
  publishFailureChannels,
  publishReadiness,
  publishStagePercent,
  PublishRefusedError,
  refusedFileList,
  resolvePublishErrorCode,
  samePaths,
  summarizePublish,
  uploadStagePercent,
} from "./publishPlan";

const newInput = {
  mode: "new" as const,
  diff: "",
  modsCount: 0,
  serversCount: 0,
  hasOptionsFile: false,
  hasArguments: false,
  isOtherSelected: false,
  hasWorlds: false,
  publishedHasWorld: false,
};

describe("getPublishFields", () => {
  it("hides name and logo when publishing for the first time", () => {
    expect(getPublishFields(newInput).map((f) => f.id)).toEqual([
      "mods",
      "servers",
      "options",
      "arguments",
      "world",
      "other",
    ]);
  });

  it("enables a field only when the instance has that content", () => {
    const fields = getPublishFields({
      ...newInput,
      modsCount: 3,
      hasOptionsFile: true,
    });

    expect(fields.find((f) => f.id === "mods")?.available).toBe(true);
    expect(fields.find((f) => f.id === "options")?.available).toBe(true);
    expect(fields.find((f) => f.id === "servers")?.available).toBe(false);
    expect(fields.find((f) => f.id === "other")?.available).toBe(true);
  });

  it("drives update availability from the diff", () => {
    const fields = getPublishFields({
      ...newInput,
      mode: "update",
      diff: "name,mods",
    });

    expect(fields.map((f) => f.id)).toEqual([
      "name",
      "logo",
      "mods",
      "loader",
      "servers",
      "options",
      "arguments",
      "world",
      "other",
    ]);
    expect(fields.find((f) => f.id === "name")?.available).toBe(true);
    expect(fields.find((f) => f.id === "logo")?.available).toBe(false);
    expect(fields.find((f) => f.id === "mods")?.available).toBe(true);
  });

  it("keeps additional files editable once they are selected", () => {
    const fields = getPublishFields({
      ...newInput,
      mode: "update",
      diff: "name",
      isOtherSelected: true,
    });

    expect(fields.find((f) => f.id === "other")?.available).toBe(true);
  });
});

describe("summarizePublish", () => {
  const updateFields = getPublishFields({
    ...newInput,
    mode: "update",
    diff: "name,mods,other",
  });

  const args = {
    mode: "update" as const,
    fields: updateFields,
    selection: emptyPublishSelection(),
    publishedOtherPaths: ["config"],
    publishedOtherSize: 100,
    nextOtherPaths: ["config"],
    nextOtherSize: 100,
    publishedHasWorld: false,
    isCatalogPublicChanged: false,
    isDescriptionChanged: false,
  };

  it("ignores selected but unavailable fields", () => {
    const fields = getPublishFields({ ...newInput, modsCount: 2 });
    const selection = { ...emptyPublishSelection(), mods: true, servers: true };

    expect(summarizePublish({ ...args, mode: "new", fields, selection })).toEqual(
      ["mods"],
    );
  });

  it("names the description when only the description changed", () => {
    expect(summarizePublish({ ...args, isDescriptionChanged: true })).toEqual([
      "description",
    ]);
  });

  it("names catalog visibility on its own", () => {
    expect(summarizePublish({ ...args, isCatalogPublicChanged: true })).toEqual([
      "visibility",
    ]);
  });

  it("is empty when nothing at all will be sent", () => {
    expect(summarizePublish(args)).toEqual([]);
  });

  it("drops additional files that are selected but identical", () => {
    expect(
      summarizePublish({
        ...args,
        selection: { ...emptyPublishSelection(), other: true },
      }),
    ).toEqual([]);

    expect(
      summarizePublish({
        ...args,
        selection: { ...emptyPublishSelection(), other: true },
        nextOtherPaths: ["config", "kubejs"],
      }),
    ).toEqual(["other"]);
  });

  it("keeps additional files on a first publish", () => {
    const fields = getPublishFields({ ...newInput, isOtherSelected: true });

    expect(
      summarizePublish({
        ...args,
        mode: "new",
        fields,
        selection: { ...emptyPublishSelection(), other: true },
        publishedOtherPaths: [],
        publishedOtherSize: 0,
        nextOtherPaths: [],
        nextOtherSize: 0,
      }),
    ).toEqual(["other"]);
  });

  it("lists fields in the order the dialog shows them", () => {
    expect(
      summarizePublish({
        ...args,
        selection: { ...emptyPublishSelection(), name: true, mods: true },
        isDescriptionChanged: true,
        isCatalogPublicChanged: true,
      }),
    ).toEqual(["name", "mods", "description", "visibility"]);
  });

  it("agrees with the readiness of an update", () => {
    const cases = [
      { input: args, diff: "" },
      { input: { ...args, isDescriptionChanged: true }, diff: "" },
      { input: { ...args, isCatalogPublicChanged: true }, diff: "" },
      {
        input: { ...args, selection: { ...emptyPublishSelection(), name: true } },
        diff: "name",
      },
      {
        input: {
          ...args,
          selection: { ...emptyPublishSelection(), other: true },
          nextOtherSize: 200,
        },
        diff: "",
      },
    ];

    for (const { input, diff } of cases) {
      const summary = summarizePublish(input);
      const readiness = publishReadiness({
        ...input,
        diff,
        selectedCount: summary.length,
      });

      expect(summary.length > 0).toBe(readiness === "ready");
    }
  });
});

describe("publishReadiness", () => {
  const args = {
    mode: "update" as const,
    diff: "",
    selection: emptyPublishSelection(),
    publishedOtherPaths: ["config"],
    publishedOtherSize: 100,
    nextOtherPaths: ["config"],
    nextOtherSize: 100,
    publishedHasWorld: false,
    isCatalogPublicChanged: false,
    isDescriptionChanged: false,
    selectedCount: 0,
  };

  it("always allows the first publish", () => {
    expect(publishReadiness({ ...args, mode: "new" })).toBe("ready");
  });

  it("reports no changes when the instance matches the published pack", () => {
    expect(publishReadiness(args)).toBe("noChanges");
  });

  it("asks what to update when the diff has something and nothing is ticked", () => {
    expect(publishReadiness({ ...args, diff: "mods,servers" })).toBe(
      "nothingSelected",
    );
  });

  it("is ready once a changed part is ticked", () => {
    expect(
      publishReadiness({
        ...args,
        diff: "mods",
        selection: { ...emptyPublishSelection(), mods: true },
        selectedCount: 1,
      }),
    ).toBe("ready");
  });

  it("is ready for a visibility or description change alone", () => {
    expect(
      publishReadiness({ ...args, isCatalogPublicChanged: true, selectedCount: 1 }),
    ).toBe("ready");
    expect(
      publishReadiness({ ...args, isDescriptionChanged: true, selectedCount: 1 }),
    ).toBe("ready");
  });

  it("keeps no changes when identical additional files are selected", () => {
    expect(
      publishReadiness({
        ...args,
        selection: { ...emptyPublishSelection(), other: true },
      }),
    ).toBe("noChanges");
  });

  it("sees additional files picked inside the dialog", () => {
    expect(
      publishReadiness({
        ...args,
        selection: { ...emptyPublishSelection(), other: true },
        nextOtherPaths: ["config", "kubejs"],
        selectedCount: 1,
      }),
    ).toBe("ready");
    expect(
      publishReadiness({
        ...args,
        selection: { ...emptyPublishSelection(), other: true },
        nextOtherSize: 200,
        selectedCount: 1,
      }),
    ).toBe("ready");
  });
});

describe("samePaths", () => {
  it("ignores order", () => {
    expect(samePaths(["a", "b"], ["b", "a"])).toBe(true);
    expect(samePaths(["a"], ["a", "b"])).toBe(false);
  });
});

describe("publish progress", () => {
  it("moves forward through the stages", () => {
    expect(publishStagePercent("creatingShare")).toBe(5);
    expect(publishStagePercent("publishing")).toBe(92);
    expect(publishStagePercent("completed")).toBe(100);
  });

  it("maps the upload percentage into its own band", () => {
    expect(uploadStagePercent(0)).toBe(45);
    expect(uploadStagePercent(100)).toBe(80);
    expect(uploadStagePercent(-20)).toBe(45);
    expect(uploadStagePercent(500)).toBe(80);
  });
});

describe("resolvePublishErrorCode", () => {
  it("recognises the known failures", () => {
    expect(resolvePublishErrorCode(new Error("payload_too_large"))).toBe(
      "payloadTooLarge",
    );
    expect(resolvePublishErrorCode(new Error("limit_exceeded"))).toBe(
      "limitExceeded",
    );
    expect(resolvePublishErrorCode(new Error("logo_failed"))).toBe(
      "logoFailed",
    );
    expect(resolvePublishErrorCode(new Error("upload_failed"))).toBe(
      "uploadFailed",
    );
    expect(resolvePublishErrorCode(new Error("name_taken"))).toBe("nameTaken");
    expect(resolvePublishErrorCode("boom")).toBe("generic");
  });
});

describe("isOtherOverLimit", () => {
  it("uses the raw files limit", () => {
    expect(isOtherOverLimit(MAX_OTHER_BYTES)).toBe(false);
    expect(isOtherOverLimit(MAX_OTHER_BYTES + 1)).toBe(true);
  });
});

describe("pickNewPublishDefaults", () => {
  const fields = [
    { id: "mods" as const, available: true },
    { id: "servers" as const, available: false },
    { id: "options" as const, available: true },
    { id: "other" as const, available: true },
  ];

  it("ticks every available part except the file picker", () => {
    expect(pickNewPublishDefaults(fields, new Set())).toEqual([
      "mods",
      "options",
    ]);
  });

  it("never ticks the same part twice", () => {
    expect(pickNewPublishDefaults(fields, new Set(["mods" as const]))).toEqual([
      "options",
    ]);
  });

  it("returns nothing when there is nothing to publish", () => {
    expect(
      pickNewPublishDefaults(
        [{ id: "mods" as const, available: false }],
        new Set(),
      ),
    ).toEqual([]);
  });

  it("ticks the extra files for a build installed from a modpack", () => {
    expect(pickNewPublishDefaults(fields, new Set(), true)).toEqual([
      "mods",
      "options",
      "other",
    ]);
  });

  it("does not tick the extra files again after the player unticked them", () => {
    expect(
      pickNewPublishDefaults(
        fields,
        new Set(["mods", "options", "other"] as const),
        true,
      ),
    ).toEqual([]);
  });
});

describe("findModpackOtherPaths", () => {
  it("keeps only the script and config folders that exist", async () => {
    const present = new Set(["config", "kubejs", "kubegroovy"]);

    expect(
      await findModpackOtherPaths(async (path) => present.has(path)),
    ).toEqual(["config", "kubejs", "kubegroovy"]);
  });

  it("finds nothing in a build without those folders", async () => {
    expect(await findModpackOtherPaths(async () => false)).toEqual([]);
  });
});

describe("local mods publish failures", () => {
  const error = new LocalModsUploadError([
    "off.jar: file not found locally",
    "big.jar: upload rejected",
    "Create: Steam 'n' Rails: read ECONNRESET",
  ]);

  it("gets its own error code", () => {
    expect(resolvePublishErrorCode(error)).toBe("localMods");
    expect(
      resolvePublishErrorCode(new Error("local mods upload failed: a.jar")),
    ).toBe("localMods");
  });

  it("keeps the failure list in the technical message", () => {
    expect(error.message).toContain("off.jar: file not found locally");
    expect(error.message).toContain("big.jar: upload rejected");
  });

  it("splits missing files from files the server did not take", () => {
    expect(localModsFailureFiles(error)).toEqual({
      missing: ["off.jar"],
      failed: ["big.jar", "Create"],
    });
    expect(localModsFailureFiles(new LocalModsUploadError([]))).toBeNull();
    expect(localModsFailureFiles(new Error("boom"))).toBeNull();
  });

  it("shortens a long file list", () => {
    expect(formatFileList(["a", "b"])).toBe("a, b");
    expect(formatFileList(["a", "b", "c", "d"], 2)).toBe("a, b +2");
  });
});

describe("publishFailureChannels", () => {
  it("never borrows an unrelated buffered failure for a known cause", () => {
    expect(publishFailureChannels("nameTaken")).toBeUndefined();
    expect(publishFailureChannels("limitExceeded")).toBeUndefined();
    expect(
      publishFailureChannels(
        "localMods",
        new LocalModsUploadError(["a.jar: file not found locally"]),
      ),
    ).toBeUndefined();
  });

  it("looks only at the publish steps for the rest", () => {
    const generic = publishFailureChannels("generic") ?? [];
    expect(generic).toContain("backend:");
    expect(generic.some((channel) => channel.startsWith("fs:"))).toBe(false);
    expect(publishFailureChannels("uploadFailed")).toEqual([
      "backend:uploadFileFromPath",
      "file:archiveForPublish",
    ]);
    expect(
      publishFailureChannels("localMods", new LocalModsUploadError([])),
    ).toEqual(["share:uploadMods"]);
  });
});

describe("orphanedPublishUploads", () => {
  it("cleans up uploads only while the backend has not accepted the publish", () => {
    expect(
      orphanedPublishUploads({
        isRemoteCommitted: false,
        otherUrl: "modpacks/abc/other_1.zip",
        imageUrl: "modpacks/abc/logo_1.png",
      }),
    ).toEqual(["modpacks/abc/other_1.zip", "modpacks/abc/logo_1.png"]);
  });

  it("never deletes files the published pack already points at", () => {
    expect(
      orphanedPublishUploads({
        isRemoteCommitted: true,
        otherUrl: "modpacks/abc/other_1.zip",
        imageUrl: "modpacks/abc/logo_1.png",
      }),
    ).toEqual([]);
  });
});

describe("world publishing and the file list", () => {
  const updateFields = getPublishFields({
    mode: "update",
    diff: "",
    modsCount: 0,
    serversCount: 0,
    hasOptionsFile: false,
    hasArguments: false,
    isOtherSelected: false,
    hasWorlds: true,
    publishedHasWorld: true,
  });

  const base = {
    mode: "update" as const,
    diff: "",
    fields: updateFields,
    publishedOtherPaths: ["config"],
    publishedOtherSize: 100,
    nextOtherPaths: ["config"],
    nextOtherSize: 100,
    isCatalogPublicChanged: false,
    isDescriptionChanged: false,
  };

  it("notices the world being added even though paths never name it", () => {
    const selection = { ...emptyPublishSelection(), world: true };

    expect(
      publishReadiness({
        ...base,
        selection,
        publishedHasWorld: false,
        selectedCount: 1,
      }),
    ).toBe("ready");
    expect(
      summarizePublish({ ...base, selection, publishedHasWorld: false }),
    ).toContain("world");
  });

  it("notices the world being taken back out", () => {
    const selection = { ...emptyPublishSelection(), other: true };

    expect(
      publishReadiness({
        ...base,
        selection,
        publishedHasWorld: true,
        selectedCount: 1,
      }),
    ).toBe("ready");
  });

  it("stays quiet when the archive and the world are both unchanged", () => {
    const selection = { ...emptyPublishSelection(), other: true, world: true };

    expect(
      publishReadiness({
        ...base,
        selection,
        publishedHasWorld: true,
        selectedCount: 1,
      }),
    ).toBe("noChanges");
    expect(
      summarizePublish({ ...base, selection, publishedHasWorld: true }),
    ).toEqual([]);
  });

  it("never offers the world as a default tick", () => {
    const fields = getPublishFields({
      mode: "new",
      diff: "",
      modsCount: 2,
      serversCount: 0,
      hasOptionsFile: false,
      hasArguments: false,
      isOtherSelected: false,
      hasWorlds: true,
      publishedHasWorld: false,
    });

    expect(pickNewPublishDefaults(fields, new Set())).not.toContain("world");
    expect(pickNewPublishDefaults(fields, new Set())).toContain("mods");
  });
});

describe("publish refused by the jar check", () => {
  it("gets an error code per refusal", () => {
    const refused = (
      code: "infected" | "filesMissing" | "tooLarge" | "scanUnavailable",
    ) => resolvePublishErrorCode(new PublishRefusedError({ code, files: [] }));

    expect(refused("infected")).toBe("infected");
    expect(refused("filesMissing")).toBe("filesMissing");
    expect(refused("tooLarge")).toBe("scanTooLarge");
    expect(refused("scanUnavailable")).toBe("scanUnavailable");
  });

  it("names the files and what was found in them", () => {
    const error = new PublishRefusedError({
      code: "infected",
      files: [
        { file: "helper.jar", threats: ["fractureiser", "Skyrage"] },
        { file: "other" },
      ],
    });

    expect(refusedFileList(error)).toBe(
      "helper.jar (fractureiser, Skyrage), other",
    );
    expect(
      refusedFileList(new PublishRefusedError({ code: "infected", files: [] })),
    ).toBeUndefined();
    expect(refusedFileList(new Error("x"))).toBeUndefined();
  });
});
