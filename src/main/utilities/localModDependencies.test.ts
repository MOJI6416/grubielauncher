import { afterEach, describe, expect, it } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";
import Zip from "adm-zip";
import {
  fabricDependencies,
  forgeDependencies,
  quiltDependencies,
  scanLocalModDependencies,
} from "./localModDependencies";

const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0)) await fs.remove(dir);
});

describe("local mod dependencies", () => {
  it("reads Fabric required mods and provided aliases without optional suggestions", () => {
    expect(
      fabricDependencies({
        id: "addon",
        provides: ["alias"],
        depends: { library: "*" },
        suggests: { optional: "*" },
      }),
    ).toEqual({ provides: ["addon", "alias"], requires: ["library"] });
  });
  it("reads Forge and NeoForge required dependencies of every declared mod", () => {
    expect(
      forgeDependencies({
        mods: [{ modId: "one" }, { modId: "two" }],
        dependencies: {
          one: [
            { modId: "lib", mandatory: true },
            { modId: "optional", mandatory: false },
          ],
          two: [
            { modId: "neo", type: "required" },
            { modId: "bad", type: "incompatible", mandatory: true },
          ],
        },
      }),
    ).toEqual({ provides: ["one", "two"], requires: ["lib", "neo"] });
  });
  it("does not turn Quilt alternatives or optional dependencies into a required mod", () => {
    expect(
      quiltDependencies({
        quilt_loader: {
          id: "q",
          provides: [{ id: "alias" }],
          depends: [
            { id: "lib" },
            { id: "optional", optional: true },
            [{ id: "a" }, { id: "b" }],
          ],
        },
      }),
    ).toEqual({ provides: ["q", "alias"], requires: ["lib"] });
  });
  it("scans real JAR descriptors, disabled files and bundled libraries without catalog metadata", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "grubie-dependencies-"),
    );
    directories.push(dir);
    await fs.ensureDir(path.join(dir, "mods"));
    const bundled = new Zip();
    bundled.addFile(
      "fabric.mod.json",
      Buffer.from(
        JSON.stringify({ id: "bundled", depends: { external: "*" } }),
      ),
    );
    const jar = new Zip();
    jar.addFile(
      "fabric.mod.json",
      Buffer.from(
        JSON.stringify({
          id: "addon",
          depends: { bundled: "*" },
          jars: [{ file: "nested.jar" }],
        }),
      ),
    );
    jar.addFile("nested.jar", bundled.toBuffer());
    jar.writeZip(path.join(dir, "mods", "addon.jar.disabled"));
    const forge = new Zip();
    forge.addFile(
      "META-INF/mods.toml",
      Buffer.from('[[mods]]\nmodId="external"\n'),
    );
    forge.writeZip(path.join(dir, "mods", "library.jar"));
    await fs.writeFile(path.join(dir, "mods", "broken.jar"), "broken");
    const index = await scanLocalModDependencies(dir);
    expect(index["addon.jar"]).toEqual({
      provides: ["addon", "bundled"],
      requires: ["external"],
    });
    expect(index["library.jar"]).toEqual({
      provides: ["external"],
      requires: [],
    });
    expect(index["broken.jar"]).toBeUndefined();
    const replacement = new Zip();
    replacement.addFile(
      "fabric.mod.json",
      Buffer.from(JSON.stringify({ id: "changed_mod_id" })),
    );
    replacement.writeZip(path.join(dir, "mods", "library.jar"));
    expect(
      (await scanLocalModDependencies(dir))["library.jar"].provides,
    ).toEqual(["changed_mod_id"]);
  });
});
