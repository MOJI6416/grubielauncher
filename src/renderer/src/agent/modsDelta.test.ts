import { describe, expect, it } from "vitest";
import { applyModsDelta, projectKey } from "./modsDelta";

function mod(id: string, version = "v1") {
  return {
    title: id,
    id,
    provider: "modrinth",
    version: { id: version, files: [], dependencies: [] },
  } as any;
}

describe("applyModsDelta", () => {
  it("drops what an install added and keeps the rest", () => {
    const next = applyModsDelta([mod("a"), mod("b"), mod("c")], [], [
      projectKey(mod("b")),
    ]);

    expect(next.map((entry) => entry.id)).toEqual(["a", "c"]);
  });

  it("brings removed projects back at the end", () => {
    const next = applyModsDelta([mod("a")], [mod("b"), mod("c")], []);

    expect(next.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("puts the previous version back in place without moving the entry", () => {
    const next = applyModsDelta(
      [mod("a", "new"), mod("b", "new")],
      [mod("a", "old")],
      [],
    );

    expect(next.map((entry) => `${entry.id}@${entry.version?.id}`)).toEqual([
      "a@old",
      "b@new",
    ]);
  });

  it("leaves projects the user added afterwards alone", () => {
    const next = applyModsDelta([mod("a"), mod("late")], [], [
      projectKey(mod("a")),
    ]);

    expect(next.map((entry) => entry.id)).toEqual(["late"]);
  });
});
