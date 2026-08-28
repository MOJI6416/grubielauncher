import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = [
  resolve(__dirname, ".."),
  resolve(__dirname, "../../../components"),
];

const FOOTER_TAG =
  /<(?:Dialog|AlertDialog|Sheet)Footer\b[^>]*className=\{?"([^"]*)"/g;

function sourceFiles(directory: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);

    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }

    if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) found.push(full);
  }

  return found;
}

function footerClasses(): Array<{ file: string; classes: string }> {
  const found: Array<{ file: string; classes: string }> = [];

  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const source = readFileSync(file, "utf8");

      for (const match of source.matchAll(FOOTER_TAG)) {
        found.push({ file: relative(root, file), classes: match[1] });
      }
    }
  }

  return found;
}

describe("dialog footer rounding", () => {
  it("finds the footers it is supposed to guard", () => {
    expect(footerClasses().length).toBeGreaterThan(4);
  });

  it("never squares off a bleeding footer", () => {
    const squared = footerClasses().filter(({ classes }) =>
      /(^|\s)rounded-none(\s|$)/.test(classes),
    );

    expect(squared).toEqual([]);
  });
});
