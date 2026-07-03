export interface PathUtils {
  join: (...args: string[]) => string;
  basename: (filePath: string, suffix?: string) => string;
  extname: (filePath: string) => string;
}

export function createPathUtils(isWindows: boolean): PathUtils {
  const sep = isWindows ? "\\" : "/";
  const splitRe = isWindows ? /[\\/]+/ : /\/+/;

  const isSep = (ch: string): boolean =>
    ch === "/" || (isWindows && ch === "\\");

  const splitRoot = (p: string): { root: string; rest: string } => {
    if (!isWindows) {
      return p.startsWith("/")
        ? { root: "/", rest: p.slice(1) }
        : { root: "", rest: p };
    }

    if (/^[a-zA-Z]:/.test(p)) {
      const hasSep = p.length > 2 && isSep(p[2]);
      return {
        root: p.slice(0, 2) + (hasSep ? "\\" : ""),
        rest: p.slice(hasSep ? 3 : 2),
      };
    }

    if (p.length >= 2 && isSep(p[0]) && isSep(p[1])) {
      let serverEnd = 2;
      while (serverEnd < p.length && !isSep(p[serverEnd])) serverEnd += 1;
      if (serverEnd > 2 && serverEnd < p.length) {
        let shareEnd = serverEnd + 1;
        while (shareEnd < p.length && !isSep(p[shareEnd])) shareEnd += 1;
        if (shareEnd > serverEnd + 1) {
          const hasSep = shareEnd < p.length;
          return {
            root:
              p.slice(0, shareEnd).replace(/\//g, "\\") + (hasSep ? "\\" : ""),
            rest: p.slice(hasSep ? shareEnd + 1 : shareEnd),
          };
        }
      }
      return { root: "\\", rest: p.slice(1) };
    }

    if (p.length > 0 && isSep(p[0])) {
      return { root: "\\", rest: p.slice(1) };
    }

    return { root: "", rest: p };
  };

  const normalize = (p: string): string => {
    if (!p) return ".";

    const { root, rest } = splitRoot(p);
    const out: string[] = [];

    for (const segment of rest.split(splitRe)) {
      if (!segment || segment === ".") continue;
      if (segment === "..") {
        if (out.length > 0 && out[out.length - 1] !== "..") {
          out.pop();
        } else if (!root) {
          out.push("..");
        }
        continue;
      }
      out.push(segment);
    }

    let result = root + out.join(sep);
    if (!result) return ".";
    if (out.length > 0 && isSep(p[p.length - 1])) result += sep;
    return result;
  };

  const join = (...args: string[]): string => {
    const parts: string[] = [];
    for (const arg of args) {
      if (typeof arg === "string" && arg.length > 0) parts.push(arg);
    }
    if (parts.length === 0) return ".";
    return normalize(parts.join(sep));
  };

  const basename = (filePath: string, suffix?: string): string => {
    if (!filePath) return "";

    let end = filePath.length;
    while (end > 0 && isSep(filePath[end - 1])) end -= 1;

    if (isWindows && end === 2 && /^[a-zA-Z]:$/.test(filePath.slice(0, 2))) {
      return "";
    }

    let start = end;
    while (start > 0 && !isSep(filePath[start - 1])) start -= 1;

    let base = filePath.slice(start, end);
    if (
      suffix &&
      suffix.length > 0 &&
      suffix.length < base.length &&
      base.endsWith(suffix)
    ) {
      base = base.slice(0, base.length - suffix.length);
    }
    return base;
  };

  const extname = (filePath: string): string => {
    const base = basename(filePath);
    const dotIndex = base.lastIndexOf(".");
    if (dotIndex <= 0) return "";
    return base.slice(dotIndex);
  };

  return { join, basename, extname };
}
