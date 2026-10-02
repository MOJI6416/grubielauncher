import { describe, expect, it } from "vitest";
import { childProcessEnv } from "./childEnv";

const mount = "/tmp/.mount_grubieohGMLF";

describe("childProcessEnv", () => {
  it("drops what the AppImage runtime added and keeps the user's own values", () => {
    const env = childProcessEnv({
      APPDIR: mount,
      APPIMAGE: "/home/steve/Apps/grubie-launcher-2.0.8.AppImage",
      ARGV0: "/home/steve/Apps/grubie-launcher-2.0.8.AppImage",
      OWD: "/home/steve",
      LD_LIBRARY_PATH: `${mount}/usr/lib:/opt/cuda/lib64`,
      PATH: `${mount}:${mount}/usr/sbin:/usr/local/bin:/usr/bin`,
      XDG_DATA_DIRS: `${mount}/usr/share/:/usr/share/gnome:/usr/share/`,
      GSETTINGS_SCHEMA_DIR: `${mount}/usr/share/glib-2.0/schemas`,
      HOME: "/home/steve",
      DISPLAY: ":0",
    });

    expect(env).toEqual({
      LD_LIBRARY_PATH: "/opt/cuda/lib64",
      PATH: "/usr/local/bin:/usr/bin",
      XDG_DATA_DIRS: "/usr/share/gnome:/usr/share/",
      HOME: "/home/steve",
      DISPLAY: ":0",
    });
  });

  it("does not treat a sibling directory with the same prefix as bundled", () => {
    const env = childProcessEnv({
      APPDIR: mount,
      APPIMAGE: "/a.AppImage",
      LD_LIBRARY_PATH: `${mount}-other/lib`,
    });
    expect(env.LD_LIBRARY_PATH).toBe(`${mount}-other/lib`);
  });

  it("returns the environment untouched outside an AppImage", () => {
    const source = { PATH: "C:\\Windows;C:\\Java\\bin", APPDIR: "/somewhere" };
    expect(childProcessEnv(source)).toBe(source);
  });
});
