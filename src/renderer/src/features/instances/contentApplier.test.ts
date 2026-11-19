import { describe, expect, it, vi } from "vitest";
import { ProjectType, Provider, type ILocalProject } from "@/types/ModManager";
import {
  createContentApplier,
  type ContentApplierState,
} from "./contentApplier";

function mod(id: string): ILocalProject {
  return {
    id,
    title: id,
    description: "",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    provider: Provider.MODRINTH,
    version: {
      id: `${id}-1`,
      files: [
        { filename: `${id}.jar`, url: "", sha1: "", size: 1, isServer: true },
      ],
      dependencies: [],
    },
  } as ILocalProject;
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function setup(initial: ILocalProject[] = []) {
  const conf = { mods: initial };
  const states: ContentApplierState[] = [];
  const gates: ReturnType<typeof deferred>[] = [];
  const persist = vi.fn(async (next: ILocalProject[]) => {
    const gate = deferred();
    gates.push(gate);
    const previous = conf.mods;
    conf.mods = next;
    try {
      await gate.promise;
    } catch (error) {
      conf.mods = previous;
      throw error;
    }
  });
  const applier = createContentApplier({
    read: () => conf.mods,
    persist,
    onChange: (state) => states.push(state),
  });
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  return { conf, states, gates, persist, applier, settle };
}

describe("createContentApplier", () => {
  it("shows the change at once and keeps it once it is applied", async () => {
    const { applier, conf, gates, states, settle } = setup([mod("a")]);
    const next = [mod("a"), mod("b")];

    const result = applier.apply(next);
    expect(applier.current()).toBe(next);
    expect(states.at(-1)).toEqual({ mods: next, applying: true });

    await settle();
    gates[0].resolve();
    await expect(result).resolves.toBe("applied");

    expect(conf.mods).toBe(next);
    expect(applier.current()).toBe(next);
    expect(states.at(-1)?.applying).toBe(false);
  });

  it("rolls the list back to what is on disk when applying fails", async () => {
    const initial = [mod("a")];
    const { applier, conf, gates, settle } = setup(initial);

    const result = applier.apply([mod("a"), mod("b")]);
    await settle();
    gates[0].reject(new Error("download failed"));

    await expect(result).rejects.toThrow("download failed");
    expect(conf.mods).toBe(initial);
    expect(applier.current()).toBe(initial);
    expect(applier.isApplying()).toBe(false);
  });

  it("runs changes one after another in the order they were made", async () => {
    const { applier, persist, gates, conf, settle } = setup([]);
    const first = [mod("a")];
    const second = [mod("a"), mod("b")];

    const one = applier.apply(first);
    const two = applier.apply(second);
    expect(applier.current()).toBe(second);

    await settle();
    expect(persist).toHaveBeenCalledTimes(1);
    gates[0].resolve();
    await one;
    await settle();

    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[1][0]).toBe(second);
    gates[1].resolve();
    await two;
    expect(conf.mods).toBe(second);
  });

  it("drops changes queued behind a failed one so they cannot bring it back", async () => {
    const initial = [mod("a")];
    const { applier, persist, gates, conf, settle } = setup(initial);

    const failing = applier.apply([mod("a"), mod("broken")]);
    const queued = applier.apply([mod("a"), mod("broken"), mod("c")]);

    await settle();
    gates[0].reject(new Error("blocked"));

    await expect(failing).rejects.toThrow("blocked");
    await expect(queued).resolves.toBe("dropped");
    expect(persist).toHaveBeenCalledTimes(1);
    expect(conf.mods).toBe(initial);
    expect(applier.current()).toBe(initial);
  });

  it("accepts new changes after a failure", async () => {
    const initial = [mod("a")];
    const { applier, gates, conf, settle } = setup(initial);

    const failing = applier.apply([]);
    await settle();
    gates[0].reject(new Error("locked"));
    await expect(failing).rejects.toThrow("locked");

    const next = [mod("a"), mod("d")];
    const retry = applier.apply(next);
    await settle();
    gates[1].resolve();
    await expect(retry).resolves.toBe("applied");
    expect(conf.mods).toBe(next);
  });

  it("reloads from disk only while nothing is being applied", async () => {
    const { applier, conf, gates, settle } = setup([mod("a")]);

    const pending = applier.apply([]);
    conf.mods = [mod("z")];
    applier.reload();
    expect(applier.current()).toEqual([]);

    await settle();
    gates[0].resolve();
    await pending;

    const external = [mod("x")];
    conf.mods = external;
    applier.reload();
    expect(applier.current()).toBe(external);
  });

  it("lets a launch wait until every queued change is on disk", async () => {
    const { applier, gates, settle } = setup([]);
    let idle = false;

    void applier.apply([mod("a")]);
    void applier.idle().then(() => {
      idle = true;
    });

    await settle();
    expect(idle).toBe(false);
    gates[0].resolve();
    await settle();
    expect(idle).toBe(true);
  });
});
