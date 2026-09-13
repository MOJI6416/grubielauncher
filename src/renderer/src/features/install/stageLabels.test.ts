import { describe, expect, it } from "vitest";
import type { VersionInstallStage } from "@/types/InstallationProgress";
import en from "../../../locales/en.json";
import ru from "../../../locales/ru.json";
import uk from "../../../locales/uk.json";
import {
  buildStageRows,
  resolveStagePlan,
  stageLabelKey,
} from "./progressModel";

const STAGES: Record<VersionInstallStage, true> = {
  preparing: true,
  manifest: true,
  java: true,
  loader: true,
  installer: true,
  assets: true,
  files: true,
  mods: true,
  packs: true,
  worlds: true,
  serverMods: true,
  cleanup: true,
  other: true,
  options: true,
  done: true,
};

function lookup(bundle: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      bundle,
    );
}

describe("resolveStagePlan", () => {
  it("prefers the plan the task announced", () => {
    expect(
      resolveStagePlan({
        operation: "install",
        plan: ["mods", "worlds", "cleanup"],
      }),
    ).toEqual(["mods", "worlds", "cleanup"]);
  });

  it("shows no version stages for a content task without a plan", () => {
    expect(resolveStagePlan({ operation: "content" })).toEqual([]);
    expect(resolveStagePlan({ operation: "update" })).toEqual([]);
  });

  it("does not list version stages as pending while a world is installed", () => {
    const rows = buildStageRows(
      [{ stage: "worlds", startedAt: 1000, running: true }],
      resolveStagePlan({ operation: "content", plan: ["worlds", "cleanup"] }),
    );

    expect(rows.map((row) => [row.stage, row.state])).toEqual([
      ["worlds", "running"],
      ["cleanup", "pending"],
    ]);
  });
});

describe("stageLabelKey", () => {
  it("has a label for every stage in every language", () => {
    for (const bundle of [en, ru, uk]) {
      for (const stage of Object.keys(STAGES) as VersionInstallStage[]) {
        expect(typeof lookup(bundle, stageLabelKey(stage))).toBe("string");
        expect(typeof lookup(bundle, stageLabelKey(stage, "integrity"))).toBe(
          "string",
        );
      }
    }
  });

  it("switches to checking wording only for an integrity check", () => {
    expect(stageLabelKey("files")).toBe("installationProgress.stages.files");
    expect(stageLabelKey("files", "integrity")).toBe(
      "installationProgress.integrityStages.files",
    );
    expect(stageLabelKey("java", "integrity")).toBe(
      "installationProgress.stages.java",
    );
  });
});
