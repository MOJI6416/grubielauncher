import { describe, expect, it } from "vitest";
import type { ServerRunStatePayload } from "@/types/Server";
import { applyServerRunState, isServerOfInstance } from "./runningServers";

function payload(
  serverPath: string,
  state: ServerRunStatePayload["state"],
): ServerRunStatePayload {
  return { serverPath, state, pid: 1, startedAt: 1 };
}

describe("running servers", () => {
  it("keeps one entry per server and drops a stopped one", () => {
    const starting = applyServerRunState(
      [],
      payload("C:\\Data\\versions\\Aged\\server", "starting"),
    );
    const running = applyServerRunState(
      starting,
      payload("c:/data/versions/aged/server", "running"),
    );
    expect(running).toHaveLength(1);
    expect(running[0].state).toBe("running");

    expect(
      applyServerRunState(
        running,
        payload("C:\\Data\\versions\\Aged\\server", "stopped"),
      ),
    ).toEqual([]);
  });

  it("matches a server to the instance folder that holds it", () => {
    expect(
      isServerOfInstance(
        "C:\\Data\\versions\\Aged\\server",
        "C:/Data/versions/Aged/",
      ),
    ).toBe(true);
    expect(
      isServerOfInstance("C:\\Data\\versions\\Aged\\server", "C:/Data/versions/Age"),
    ).toBe(false);
    expect(isServerOfInstance("C:\\Data\\versions\\Aged\\server", "")).toBe(
      false,
    );
  });
});
