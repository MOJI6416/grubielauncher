import { describe, expect, it } from "vitest";
import {
  ConfigField,
  descriptionLines,
  fieldHints,
  humanizeKey,
  parseDefault,
  parseConfigDocument,
  positionAt,
  writeField,
} from "./document";

function parse(text: string, name: string) {
  const document = parseConfigDocument(text, name);
  if (!document) throw new Error("unsupported");
  return document;
}

function field(fields: ConfigField[], key: string): ConfigField {
  const found = fields.find(
    (entry) => [...entry.section, entry.key].join(".") === key,
  );
  if (!found) throw new Error(`no field ${key}`);
  return found;
}

function issueAt(text: string, name: string) {
  const document = parse(text, name);
  if (!document.issue) return null;
  const position = positionAt(text, document.issue.offset);
  return {
    code: document.issue.code,
    line: position.line + 1,
    detail: document.issue.detail,
  };
}

describe("json", () => {
  const text = `{
  // Render distance in chunks
  "renderDistance": 12,
  "fancy": true,
  'name': 'Steve',
  nested: { "scale": 1.5, "tags": ["a", "b",], },
}
`;

  it("reads nested fields with comments, trailing commas and json5 keys", () => {
    const document = parse(text, "options.json5");
    expect(document.issue).toBeNull();
    expect(field(document.fields, "renderDistance")).toMatchObject({
      kind: "number",
      value: 12,
      comments: ["Render distance in chunks"],
      numberStyle: "integer",
    });
    expect(field(document.fields, "fancy").value).toBe(true);
    expect(field(document.fields, "name")).toMatchObject({
      value: "Steve",
      quote: "'",
    });
    expect(field(document.fields, "nested.scale").value).toBe(1.5);
    expect(field(document.fields, "nested.tags")).toMatchObject({
      kind: "list",
      value: ["a", "b"],
    });
  });

  it("writes values back without touching the rest of the file", () => {
    const document = parse(text, "options.json5");
    let next = writeField(
      text,
      "json",
      field(document.fields, "renderDistance"),
      16,
    );
    next = writeField(
      next,
      "json",
      field(parse(next, "a.json").fields, "fancy"),
      false,
    );
    next = writeField(
      next,
      "json",
      field(parse(next, "a.json").fields, "name"),
      "Alex's",
    );
    next = writeField(
      next,
      "json",
      field(parse(next, "a.json").fields, "nested.scale"),
      2,
    );

    expect(next).toContain('"renderDistance": 16,');
    expect(next).toContain('"fancy": false,');
    expect(next).toContain("'name': 'Alex\\'s',");
    expect(next).toContain('"scale": 2.0');
    expect(next).toContain("// Render distance in chunks");
    expect(parse(next, "a.json").issue).toBeNull();
  });

  it("points at the typical hand-editing mistakes", () => {
    expect(issueAt('{\n  "a": 1\n  "b": 2\n}', "a.json")).toMatchObject({
      code: "expectedComma",
      line: 3,
    });
    expect(issueAt('{\n  "a": tru\n}', "a.json")).toMatchObject({
      code: "invalidValue",
      line: 2,
      detail: "tru",
    });
    expect(issueAt('{\n  "a": {\n    "b": 1\n}', "a.json")).toMatchObject({
      code: "unclosedBracket",
      line: 1,
    });
    expect(issueAt('{\n  "a": "text\n}', "a.json")).toMatchObject({
      code: "unterminatedString",
      line: 2,
    });
    expect(issueAt('{\n  "a" 1\n}', "a.json")).toMatchObject({
      code: "expectedColon",
      line: 2,
    });
    expect(issueAt('{"a": 1}}', "a.json")).toMatchObject({
      code: "trailingContent",
    });
  });

  it("accepts empty files", () => {
    expect(parse("", "a.json").issue).toBeNull();
  });

  it("accepts what lenient Gson accepts", () => {
    const document = parse(
      '{\n  "comment": "first line\n  second line",\n  "unit": FE,\n  "flag": True\n}',
      "a.json",
    );
    expect(document.issue).toBeNull();
    expect(field(document.fields, "unit")).toMatchObject({
      kind: "string",
      value: "FE",
    });
    expect(field(document.fields, "flag")).toMatchObject({
      kind: "boolean",
      value: true,
    });
    expect(parse("FE", "selected_energy.json").issue).toBeNull();
  });

  it("still flags words that look like broken literals or numbers", () => {
    for (const word of ["tru", "fasle", "nul", "12a", "1.2.3"]) {
      expect(issueAt(`{"a": ${word}}`, "a.json")).toMatchObject({
        code: "invalidValue",
        detail: word,
      });
    }
  });
});

describe("toml", () => {
  const text = `#Client settings
[client]
\t#Show the overlay
\t#Range: 1 ~ 64
\tdistance = 16
\tscale = 1.0
\t#Allowed Values: LOW, MEDIUM, HIGH
\tquality = "MEDIUM"
\tenabled = true
\tblocks = ["minecraft:stone", "minecraft:dirt"]
\tmulti = [
\t\t"a",
\t\t"b"
\t]

[server.limits]
\t"quoted key" = 'literal'
\tinline = { a = 1, b = "x" }
\tdotted.key = 5
`;

  it("reads Forge-style tables, comments and value types", () => {
    const document = parse(text, "mod-client.toml");
    expect(document.issue).toBeNull();
    expect(field(document.fields, "client.distance")).toMatchObject({
      kind: "number",
      value: 16,
      comments: ["Show the overlay", "Range: 1 ~ 64"],
    });
    expect(field(document.fields, "client.scale")).toMatchObject({
      numberStyle: "float",
    });
    expect(field(document.fields, "client.quality")).toMatchObject({
      value: "MEDIUM",
      quote: '"',
    });
    expect(field(document.fields, "client.blocks")).toMatchObject({
      kind: "list",
      value: ["minecraft:stone", "minecraft:dirt"],
    });
    expect(field(document.fields, "client.multi").kind).toBe("complex");
    expect(field(document.fields, "server.limits.quoted key")).toMatchObject({
      value: "literal",
      quote: "'",
    });
    expect(field(document.fields, "server.limits.inline").kind).toBe("complex");
    expect(field(document.fields, "server.limits.dotted.key").value).toBe(5);
  });

  it("writes floats with a decimal point and keeps quotes", () => {
    const document = parse(text, "mod-client.toml");
    let next = writeField(
      text,
      "toml",
      field(document.fields, "client.scale"),
      2,
    );
    next = writeField(
      next,
      "toml",
      field(parse(next, "a.toml").fields, "client.quality"),
      'HI"GH',
    );
    expect(next).toContain("scale = 2.0");
    expect(next).toContain('quality = "HI\\"GH"');
    expect(parse(next, "a.toml").issue).toBeNull();
  });

  it("points at the typical hand-editing mistakes", () => {
    expect(issueAt("[a]\nkey 5\n", "a.toml")).toMatchObject({
      code: "expectedEquals",
      line: 2,
    });
    expect(issueAt('[a]\nkey = "open\n', "a.toml")).toMatchObject({
      code: "unterminatedString",
      line: 2,
    });
    expect(issueAt("[a]\nkey = yes\n", "a.toml")).toMatchObject({
      code: "invalidValue",
      line: 2,
      detail: "yes",
    });
    expect(issueAt("[a]\nkey = 1\nkey = 2\n", "a.toml")).toMatchObject({
      code: "duplicateKey",
      line: 3,
      detail: "key",
    });
    expect(issueAt("[a]\nlist = [1, 2\n", "a.toml")).toMatchObject({
      code: "unclosedBracket",
      line: 2,
    });
    expect(issueAt("[a\nkey = 1\n", "a.toml")).toMatchObject({
      code: "invalidHeader",
      line: 1,
    });
    expect(issueAt("[a]\nkey = 1 2\n", "a.toml")).toMatchObject({
      code: "trailingContent",
      line: 2,
    });
    expect(issueAt("[a]\nkey =\n", "a.toml")).toMatchObject({
      code: "expectedValue",
      line: 2,
    });
    expect(issueAt("[a]\n[a]\n", "a.toml")).toMatchObject({
      code: "duplicateKey",
      line: 2,
    });
  });

  it("accepts the same key in separate array tables", () => {
    expect(
      parse("[[entry]]\nid = 1\n[[entry]]\nid = 2\n", "a.toml").issue,
    ).toBeNull();
  });

  it("accepts dates and special numbers", () => {
    expect(
      parse(
        "a = 1979-05-27T07:32:00Z\nb = 1979-05-27 07:32:00\nc = inf\nd = 0x1F\ne = 1_000\n",
        "a.toml",
      ).issue,
    ).toBeNull();
  });
});

describe("properties and ini", () => {
  it("reads server.properties", () => {
    const text =
      "#Minecraft server properties\nmotd=A Minecraft Server\nmax-players=20\npvp=true\n";
    const document = parse(text, "server.properties");
    expect(document.issue).toBeNull();
    expect(field(document.fields, "max-players")).toMatchObject({
      kind: "number",
      value: 20,
    });
    expect(field(document.fields, "pvp").value).toBe(true);
    const next = writeField(
      text,
      "properties",
      field(document.fields, "motd"),
      "Hello world",
    );
    expect(next).toContain("motd=Hello world\n");
  });

  it("reads ini sections and flags broken headers", () => {
    const document = parse(
      "[general]\n; volume\nvolume = 0.5\n",
      "settings.ini",
    );
    expect(field(document.fields, "general.volume")).toMatchObject({
      value: 0.5,
      comments: ["volume"],
    });
    expect(issueAt("[general\nvolume = 1\n", "settings.ini")).toMatchObject({
      code: "invalidHeader",
      line: 1,
    });
  });

  it("keeps the casing style of booleans", () => {
    const text = "[a]\nflag=True\n";
    const document = parse(text, "a.ini");
    expect(
      writeField(text, "ini", field(document.fields, "a.flag"), false),
    ).toBe("[a]\nflag=False\n");
  });
});

describe("forge cfg", () => {
  const text = `# Configuration file

general {
    # Enable the thing [default: true]
    B:enabled=true

    # Distance [range: 1 ~ 64, default: 16]
    I:distance=16
    D:"scale factor"=1.5
    S:name=Steve

    S:blacklist <
        minecraft:stone
        minecraft:dirt
     >

    nested {
        B:deep=false
    }
}
`;

  it("reads categories, typed fields and lists", () => {
    const document = parse(text, "mod.cfg");
    expect(document.format).toBe("forge-cfg");
    expect(document.issue).toBeNull();
    expect(field(document.fields, "general.enabled")).toMatchObject({
      kind: "boolean",
      value: true,
      comments: ["Enable the thing [default: true]"],
    });
    expect(field(document.fields, "general.distance").numberStyle).toBe(
      "integer",
    );
    expect(field(document.fields, "general.scale factor").value).toBe(1.5);
    expect(field(document.fields, "general.blacklist")).toMatchObject({
      kind: "list",
      value: ["minecraft:stone", "minecraft:dirt"],
    });
    expect(field(document.fields, "general.nested.deep").value).toBe(false);
  });

  it("writes values in place", () => {
    const document = parse(text, "mod.cfg");
    const next = writeField(
      text,
      "forge-cfg",
      field(document.fields, "general.distance"),
      32,
    );
    expect(next).toContain("I:distance=32\n");
  });

  it("keeps values the mod itself wrote with the wrong type as text", () => {
    const document = parse(
      "general {\n    B:enabled=10.0\n    I:count=1.5\n}\n",
      "mod.cfg",
    );
    expect(document.issue).toBeNull();
    expect(field(document.fields, "general.enabled")).toMatchObject({
      kind: "string",
      value: "10.0",
    });
    expect(field(document.fields, "general.count").kind).toBe("string");
  });

  it("reads one-line lists", () => {
    const document = parse(
      "B:x=true\nS:BEACH <>\nS:biomes <Beach:Cold Beach>\nS:name=<html>\n",
      "spawn.cfg",
    );
    expect(document.issue).toBeNull();
    expect(field(document.fields, "biomes")).toMatchObject({
      kind: "complex",
      value: "Beach:Cold Beach",
    });
    expect(field(document.fields, "name")).toMatchObject({
      kind: "string",
      value: "<html>",
    });
  });

  it("points at broken categories", () => {
    expect(issueAt("general {\n    B:enabled=true\n", "mod.cfg")).toMatchObject(
      {
        code: "unclosedBracket",
        line: 1,
      },
    );
    expect(issueAt("B:a=true\n}\n", "mod.cfg")).toMatchObject({
      code: "unexpectedClose",
      line: 2,
    });
  });

  it("treats cfg files without Forge markers as ini", () => {
    expect(parse("[a]\nb=1\n", "x.cfg").format).toBe("ini");
  });
});

describe("yaml", () => {
  const text = `# Plugin settings
settings:
  # Maximum homes
  max-homes: 5
  prefix: "&7[Home]"
  enabled: true
  worlds:
    - world
    - world_nether
  description: |
    long text
    here
other: plain value # note
`;

  it("reads nested mappings, lists and quoted values", () => {
    const document = parse(text, "config.yml");
    expect(document.issue).toBeNull();
    expect(field(document.fields, "settings.max-homes")).toMatchObject({
      value: 5,
      comments: ["Maximum homes"],
    });
    expect(field(document.fields, "settings.prefix")).toMatchObject({
      value: "&7[Home]",
      quote: '"',
    });
    expect(field(document.fields, "settings.worlds")).toMatchObject({
      kind: "list",
      value: ["world", "world_nether"],
    });
    expect(field(document.fields, "settings.description").kind).toBe("complex");
    expect(field(document.fields, "other").value).toBe("plain value");
  });

  it("quotes strings that would change meaning", () => {
    const document = parse(text, "config.yml");
    const next = writeField(
      text,
      "yaml",
      field(document.fields, "other"),
      "yes: no",
    );
    expect(next).toContain('other: "yes: no" # note');
  });

  it("flags tabs and unterminated quotes", () => {
    expect(issueAt("a:\n\tb: 1\n", "a.yml")).toMatchObject({
      code: "tabIndent",
      line: 2,
    });
    expect(issueAt('a: "open\n', "a.yml")).toMatchObject({
      code: "unterminatedString",
      line: 1,
    });
  });
});

describe("fieldHints", () => {
  it("reads NeoForge range and allowed values", () => {
    expect(fieldHints(["Show the overlay", "Range: 1 ~ 64"])).toEqual({
      description: ["Show the overlay"],
      min: 1,
      max: 64,
    });
    expect(
      fieldHints(["Quality", "Allowed Values: LOW, MEDIUM, HIGH"]),
    ).toEqual({
      description: ["Quality"],
      allowed: ["LOW", "MEDIUM", "HIGH"],
    });
  });

  it("reads legacy bracket hints and defaults", () => {
    expect(fieldHints(["Distance [range: 1 ~ 64, default: 16]"])).toEqual({
      description: ["Distance"],
      min: 1,
      max: 64,
      defaultValue: "16",
    });
  });

  it("ignores unbounded limits", () => {
    expect(fieldHints(["Range: 0.0 ~ 1.7976931348623157E308"])).toEqual({
      description: [],
      min: 0,
      max: undefined,
    });
  });
});

describe("form helpers", () => {
  it("keeps only human description lines", () => {
    expect(
      descriptionLines([
        "Show the overlay",
        "Range: 1 ~ 64",
        "Distance [default: 16]",
        "",
      ]),
    ).toEqual([
      { source: "Show the overlay", text: "Show the overlay" },
      { source: "Distance [default: 16]", text: "Distance" },
    ]);
  });

  it("turns config keys into readable labels", () => {
    expect(humanizeKey("maxEntityRenderDistance")).toBe(
      "Max entity render distance",
    );
    expect(humanizeKey("enable_fancy_graphics")).toBe("Enable fancy graphics");
    expect(humanizeKey("HUDScale")).toBe("HUD scale");
    expect(humanizeKey("x")).toBe("X");
  });

  it("parses defaults by field kind", () => {
    const number = { kind: "number" } as ConfigField;
    const flag = { kind: "boolean" } as ConfigField;
    const text = { kind: "string" } as ConfigField;
    expect(parseDefault(number, "16")).toBe(16);
    expect(parseDefault(flag, "TRUE")).toBe(true);
    expect(parseDefault(flag, "maybe")).toBeNull();
    expect(parseDefault(text, '"MEDIUM"')).toBe("MEDIUM");
  });
});
