import { describe, expect, it } from "vitest";
import { getJavaAgent, HTTP_AGENT_JVM_ARGUMENT } from "./other";

describe("getJavaAgent", () => {
  it("exports the legacy Java User-Agent JVM argument", () => {
    expect(HTTP_AGENT_JVM_ARGUMENT).toBe("-Dhttp.agent=Mozilla/5.0");
  });

  it("keeps the public Grubie auth server for Grubie/Discord accounts", () => {
    expect(getJavaAgent("discord", "authlib-injector.jar")).toBe(
      "-javaagent:authlib-injector.jar=grubielauncher.com",
    );
  });

  it("keeps Ely.by server unchanged", () => {
    expect(getJavaAgent("elyby", "authlib-injector.jar")).toBe(
      "-javaagent:authlib-injector.jar=ely.by",
    );
  });
});
