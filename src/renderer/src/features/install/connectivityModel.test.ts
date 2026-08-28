import { describe, expect, it } from "vitest";
import { ConnectivityCheckResult } from "@/types/Connectivity";
import {
  buildConnectivityReport,
  groupConnectivity,
  latencyTone,
  mergeConnectivityResult,
} from "./connectivityModel";

function result(
  id: string,
  group: ConnectivityCheckResult["group"],
  ok: boolean,
  latencyMs: number | null = 120,
  name = id,
): ConnectivityCheckResult {
  return { id, name, group, target: `https://${id}`, ok, latencyMs };
}

describe("mergeConnectivityResult", () => {
  it("appends unseen ids", () => {
    const list = mergeConnectivityResult([], result("a", "grubie", true));
    expect(list).toHaveLength(1);
  });

  it("replaces an id from a previous run in place", () => {
    const first = [result("a", "grubie", true), result("b", "mirror", true)];
    const next = mergeConnectivityResult(first, result("a", "grubie", false));

    expect(next).toHaveLength(2);
    expect(next[0].ok).toBe(false);
    expect(next[1].id).toBe("b");
    expect(first[0].ok).toBe(true);
  });
});

describe("groupConnectivity", () => {
  it("orders groups and sorts rows by name", () => {
    const views = groupConnectivity([
      result("java_cdn", "java", true, 100, "Zeta"),
      result("mirror_health", "mirror", false, null),
      result("grubie_api", "grubie", true, 100, "Alpha"),
      result("grubie_cdn", "grubie", false, null, "Beta"),
    ]);

    expect(views.map((view) => view.group)).toEqual([
      "grubie",
      "mirror",
      "java",
    ]);
    expect(views[0].results.map((item) => item.name)).toEqual([
      "Alpha",
      "Beta",
    ]);
    expect(views[0].okCount).toBe(1);
    expect(views[0].total).toBe(2);
  });

  it("skips groups without results", () => {
    expect(groupConnectivity([])).toEqual([]);
  });
});

describe("latencyTone", () => {
  it("buckets latency", () => {
    expect(latencyTone(80)).toBe("fast");
    expect(latencyTone(240)).toBe("ok");
    expect(latencyTone(400)).toBe("ok");
    expect(latencyTone(1500)).toBe("slow");
    expect(latencyTone(null)).toBe("ok");
  });
});

describe("buildConnectivityReport", () => {
  it("lists every check with its verdict", () => {
    const report = buildConnectivityReport(
      [
        result("grubie_api", "grubie", true, 90),
        { ...result("mirror_health", "mirror", false, null), error: "ETIMEDOUT" },
      ],
      "auto",
    );

    expect(report).toContain("source: auto");
    expect(report).toContain("grubie: 1/1");
    expect(report).toContain("ok   grubie_api 90ms");
    expect(report).toContain("fail mirror_health");
    expect(report).toContain("ETIMEDOUT");
  });
});
