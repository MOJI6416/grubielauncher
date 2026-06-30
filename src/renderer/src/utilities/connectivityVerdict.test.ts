import { describe, it, expect } from "vitest";
import { getDownloadVerdict } from "./connectivityVerdict";
import { ConnectivityCheckResult } from "@/types/Connectivity";

function res(
  id: string,
  group: ConnectivityCheckResult["group"],
  ok: boolean,
): ConnectivityCheckResult {
  return { id, name: id, group, target: id, ok, latencyMs: ok ? 10 : null };
}

const official = (ok: boolean) => [
  res("mojang_piston", "minecraft", ok),
  res("mojang_libraries", "minecraft", ok),
  res("mojang_resources", "minecraft", ok),
];
const mirror = (ok: boolean) => [
  res("mirror_health", "mirror", ok),
  res("mirror_manifest", "mirror", ok),
];

describe("getDownloadVerdict", () => {
  it("official source depends only on Mojang", () => {
    expect(
      getDownloadVerdict([...official(true), ...mirror(false)], "official"),
    ).toMatchObject({ downloadsOk: true, messageKey: "ok" });
    expect(
      getDownloadVerdict([...official(false), ...mirror(true)], "official"),
    ).toMatchObject({ downloadsOk: false, messageKey: "officialDown" });
  });

  it("mirror source depends only on the mirror", () => {
    expect(
      getDownloadVerdict([...official(false), ...mirror(true)], "mirror"),
    ).toMatchObject({ downloadsOk: true, messageKey: "okMirror" });
    expect(
      getDownloadVerdict([...official(true), ...mirror(false)], "mirror"),
    ).toMatchObject({ downloadsOk: false, messageKey: "mirrorDown" });
  });

  it("auto succeeds when either path works", () => {
    expect(
      getDownloadVerdict([...official(true), ...mirror(true)], "auto"),
    ).toMatchObject({ downloadsOk: true, messageKey: "ok" });
    expect(
      getDownloadVerdict([...official(false), ...mirror(true)], "auto"),
    ).toMatchObject({ downloadsOk: true, messageKey: "viaMirror" });
    expect(
      getDownloadVerdict([...official(false), ...mirror(false)], "auto"),
    ).toMatchObject({ downloadsOk: false, messageKey: "fail" });
  });

  it("treats a missing mirror group as not-ok", () => {
    expect(getDownloadVerdict(official(true), "mirror")).toMatchObject({
      mirrorOk: false,
      downloadsOk: false,
    });
  });
});
