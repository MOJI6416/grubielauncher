import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const RENDERER = resolve(__dirname, "..");
const UI = resolve(__dirname, "../../../components");
const LAUNCHER = resolve(__dirname, "../../../..");

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

interface Finding {
  rule: string;
  where: string;
}

const SILENT_BODIES = new Set([
  "undefined",
  "null",
  "{}",
  "void 0",
  "({})",
  "false",
  "[]",
]);

function jsxTag(node: ts.Node): string {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  return ts.isJsxSelfClosingElement(opening) || ts.isJsxOpeningElement(opening)
    ? opening.tagName.getText()
    : "";
}

function jsxAttribute(
  node: ts.Node,
  name: string,
): ts.JsxAttribute | undefined {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  if (!ts.isJsxSelfClosingElement(opening) && !ts.isJsxOpeningElement(opening))
    return undefined;
  return opening.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText() === name,
  );
}

function classText(node: ts.Node): string {
  const attribute = jsxAttribute(node, "className");
  if (!attribute?.initializer) return "";
  const parts: string[] = [];
  const visit = (child: ts.Node) => {
    if (ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child))
      parts.push(child.text);
    else if (ts.isTemplateExpression(child)) {
      parts.push(
        child.head.text,
        ...child.templateSpans.map((span) => span.literal.text),
      );
      child.templateSpans.forEach((span) => visit(span.expression));
    } else ts.forEachChild(child, visit);
  };
  visit(attribute.initializer);
  return parts.join(" ");
}

function hasHintAbove(node: ts.Node, depth: number): boolean {
  let current = node.parent;
  let seen = 0;
  while (current && seen < depth) {
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) {
      if (jsxTag(current) === "Hint") return true;
      seen += 1;
    }
    current = current.parent;
  }
  return false;
}

function scan(): Finding[] {
  const findings: Finding[] = [];

  for (const file of [...sourceFiles(RENDERER), ...sourceFiles(UI)]) {
    const path = relative(LAUNCHER, file).replace(/\\/g, "/");
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const report = (rule: string, node: ts.Node) => {
      const { line } = source.getLineAndCharacterOfPosition(
        node.getStart(source),
      );
      findings.push({ rule, where: `${path}:${line + 1}` });
    };

    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "catch"
      ) {
        const [handler] = node.arguments;
        if (
          handler &&
          ts.isArrowFunction(handler) &&
          handler.parameters.length === 0 &&
          SILENT_BODIES.has(handler.body.getText(source).trim())
        ) {
          report("silent catch — use showFailureToast or ignoreFailure", node);
        }
      }

      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const from = node.moduleSpecifier.text;
        if (
          from === "@/components/ui/alert-dialog" &&
          !path.endsWith("Modals/Confirmation.tsx")
        ) {
          report("bare AlertDialog — use Confirmation", node);
        }
        if (
          /utilities\/clipboard$/.test(from) &&
          !path.endsWith("utilities/copyFeedback.ts")
        ) {
          report("raw clipboard — use copyWithFeedback", node);
        }
      }

      if (
        ts.isPropertyAccessExpression(node) &&
        /(^|\.)api\.clipboard\.writeText$/.test(node.getText(source)) &&
        !path.endsWith("utilities/clipboard.ts")
      ) {
        report("raw clipboard — use copyWithFeedback", node);
      }

      if (
        ts.isNewExpression(node) &&
        node.expression.getText(source) === "Intl.NumberFormat" &&
        !path.endsWith("utilities/numbers.ts")
      ) {
        report("own number format — use formatNumber", node);
      }

      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const classes = classText(node);
        if (/\[#[0-9a-fA-F]{3,8}\]/.test(classes))
          report("raw hex colour", node);

        const size = classes.match(/text-\[(0\.\d+)rem\]|text-\[(\d+)px\]/);
        if (
          size &&
          ((size[1] && parseFloat(size[1]) < 0.75) ||
            (size[2] && parseInt(size[2], 10) < 12))
        ) {
          report("micro font size — use text-2xs/3xs/4xs", node);
        }

        const sizeAttribute =
          jsxAttribute(node, "size")?.initializer?.getText(source) ?? "";
        if (
          jsxTag(node) === "Button" &&
          /icon/.test(sizeAttribute) &&
          !hasHintAbove(node, 4)
        ) {
          report("icon button without Hint", node);
        }
      }

      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return findings;
}

describe("ui contract", () => {
  it("keeps every shared pattern on its shared piece", () => {
    const findings = scan().map(
      (finding) => `${finding.rule} (${finding.where})`,
    );
    expect(findings).toEqual([]);
  });

  it("leaves toast colours to the Toaster", () => {
    const sonner = readFileSync(join(UI, "ui/sonner.tsx"), "utf8");
    expect(sonner).not.toMatch(/theme="/);
  });

  it("styles scrollbars only through ::-webkit-scrollbar", () => {
    const css = readFileSync(join(RENDERER, "assets/main.css"), "utf8");
    expect(
      css.match(/scrollbar-(width|color)\s*:\s*(?!none)[^;]+;/g) ?? [],
    ).toEqual([]);
  });
});
