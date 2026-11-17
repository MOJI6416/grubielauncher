export type MappingNamespace = "official" | "intermediary";

const PRIMITIVES: Record<string, string> = {
  void: "V",
  boolean: "Z",
  byte: "B",
  char: "C",
  short: "S",
  int: "I",
  long: "J",
  float: "F",
  double: "D",
};

const INTERMEDIARY_CLASS =
  /\bnet([./])minecraft\1class_\d+(?:\$(?:class_\d+|\d+))*/g;
const INTERMEDIARY_BARE_CLASS = /\bclass_\d+\b/g;
const INTERMEDIARY_MEMBER = /\b(?:method|field|comp)_\d+\b/g;
const INTERMEDIARY_TOKEN = /\b(?:class|method|field|comp)_\d+\b/;
const OBFUSCATED_FRAME =
  /\bat (?:[\w.-]+\/\/)?[a-z]{1,5}(?:\$[\w]+)*\.[\w$<>]+\(/;
const FRAME = /(\bat (?:[\w.-]+\/\/)?)([\w$.]+)\.([\w$<>]+)\(([^)\n]*)\)/g;

export function mappingNamespace(
  loaderName: string | undefined | null,
): MappingNamespace | null {
  const loader = (loaderName ?? "").trim().toLowerCase();
  if (loader === "" || loader === "vanilla") return "official";
  if (loader === "fabric" || loader === "quilt") return "intermediary";
  return null;
}

export function hasObfuscatedNames(
  text: string,
  namespace: MappingNamespace,
): boolean {
  return namespace === "intermediary"
    ? INTERMEDIARY_TOKEN.test(text)
    : OBFUSCATED_FRAME.test(text);
}

function dotted(name: string): string {
  return name.replace(/\//g, ".");
}

function simpleName(className: string): string {
  const dot = className.lastIndexOf(".");
  const simple = dot >= 0 ? className.slice(dot + 1) : className;
  const dollar = simple.lastIndexOf("$");
  return dollar >= 0 ? simple.slice(dollar + 1) : simple;
}

function outerSimpleName(className: string): string {
  const dot = className.lastIndexOf(".");
  return (dot >= 0 ? className.slice(dot + 1) : className).split("$")[0];
}

interface ProguardMember {
  name: string;
  obf: string;
  method: boolean;
  returnType: string;
  args: string[];
  start: number;
  end: number;
}

interface ProguardSlice {
  classToObf: Map<string, string>;
  classFromObf: Map<string, string>;
  members: Map<string, ProguardMember[]>;
}

function parseMember(left: string, obf: string): ProguardMember | null {
  let rest = left.trim();
  let start = 0;
  let end = 0;
  const lines = rest.match(/^(\d+):(\d+):/);
  if (lines) {
    start = Number(lines[1]);
    end = Number(lines[2]);
    rest = rest.slice(lines[0].length);
  }

  const open = rest.indexOf("(");
  if (open < 0) {
    const name = rest.slice(rest.lastIndexOf(" ") + 1);
    return name
      ? { name, obf, method: false, returnType: "", args: [], start, end }
      : null;
  }

  const close = rest.indexOf(")", open);
  if (close < 0) return null;
  const head = rest.slice(0, open);
  const space = head.lastIndexOf(" ");
  const argList = rest.slice(open + 1, close);

  return {
    name: head.slice(space + 1),
    obf,
    method: true,
    returnType: head.slice(0, space),
    args: argList ? argList.split(",") : [],
    start,
    end,
  };
}

function readProguard(
  text: string,
  wantedOwners: ReadonlySet<string>,
): ProguardSlice {
  const classToObf = new Map<string, string>();
  const classFromObf = new Map<string, string>();
  const members = new Map<string, ProguardMember[]>();
  let owner: string | null = null;

  for (const raw of text.split("\n")) {
    if (raw === "" || raw.startsWith("#")) continue;
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const arrow = line.lastIndexOf(" -> ");
    if (arrow < 0) continue;

    if (!line.startsWith(" ")) {
      const named = line.slice(0, arrow).trim();
      const obf = line.slice(arrow + 4).replace(/:$/, "").trim();
      classToObf.set(named, obf);
      classFromObf.set(obf, named);
      owner = wantedOwners.has(obf) ? obf : null;
      continue;
    }

    if (!owner) continue;
    const member = parseMember(line.slice(0, arrow), line.slice(arrow + 4).trim());
    if (!member) continue;
    const list = members.get(owner);
    if (list) list.push(member);
    else members.set(owner, [member]);
  }

  return { classToObf, classFromObf, members };
}

function descriptorType(type: string, classToObf: Map<string, string>): string {
  let base = type.trim();
  let prefix = "";
  while (base.endsWith("[]")) {
    prefix += "[";
    base = base.slice(0, -2);
  }
  const primitive = PRIMITIVES[base];
  if (primitive) return prefix + primitive;
  const obf = classToObf.get(base) ?? base;
  return `${prefix}L${obf.replace(/\./g, "/")};`;
}

function obfuscatedDescriptor(
  member: ProguardMember,
  classToObf: Map<string, string>,
): string {
  const args = member.args
    .map((arg) => descriptorType(arg, classToObf))
    .join("");
  return `(${args})${descriptorType(member.returnType, classToObf)}`;
}

function replaceIntermediary(
  text: string,
  classes: Map<string, string>,
  simpleClasses: Map<string, string>,
  members: Map<string, string>,
): string {
  return text
    .replace(INTERMEDIARY_CLASS, (match, separator: string) => {
      const named = classes.get(dotted(match));
      if (!named) return match;
      return separator === "/" ? named.replace(/\./g, "/") : named;
    })
    .replace(INTERMEDIARY_BARE_CLASS, (match) => simpleClasses.get(match) ?? match)
    .replace(INTERMEDIARY_MEMBER, (match) => members.get(match) ?? match);
}

export function deobfuscateIntermediary(
  text: string,
  tiny: string,
  proguard: string,
): string {
  const wantedClasses = new Set(text.match(INTERMEDIARY_BARE_CLASS) ?? []);
  const wantedMembers = new Set(text.match(INTERMEDIARY_MEMBER) ?? []);
  if (wantedClasses.size === 0 && wantedMembers.size === 0) return text;

  const classObf = new Map<string, string>();
  const memberRefs = new Map<
    string,
    { method: boolean; owner: string; desc: string; obf: string }
  >();

  for (const raw of tiny.split("\n")) {
    const parts = (raw.endsWith("\r") ? raw.slice(0, -1) : raw).split("\t");
    if (parts[0] === "CLASS" && parts.length >= 3) {
      const intermediary = dotted(parts[2]);
      if (wantedClasses.has(simpleName(intermediary))) {
        classObf.set(intermediary, dotted(parts[1]));
      }
    } else if (
      (parts[0] === "METHOD" || parts[0] === "FIELD") &&
      parts.length >= 5 &&
      wantedMembers.has(parts[4])
    ) {
      memberRefs.set(parts[4], {
        method: parts[0] === "METHOD",
        owner: dotted(parts[1]),
        desc: parts[2],
        obf: parts[3],
      });
    }
  }

  const owners = new Set<string>([...classObf.values()]);
  for (const ref of memberRefs.values()) owners.add(ref.owner);
  const slice = readProguard(proguard, owners);

  const classes = new Map<string, string>();
  const simpleClasses = new Map<string, string>();
  for (const [intermediary, obf] of classObf) {
    const named = slice.classFromObf.get(obf);
    if (!named || named === intermediary) continue;
    classes.set(intermediary, named);
    const own = simpleName(intermediary);
    if (own.startsWith("class_")) simpleClasses.set(own, simpleName(named));
  }

  const members = new Map<string, string>();
  for (const [intermediary, ref] of memberRefs) {
    const candidates = slice.members.get(ref.owner) ?? [];
    const found = ref.method
      ? candidates.find(
          (member) =>
            member.method &&
            member.obf === ref.obf &&
            obfuscatedDescriptor(member, slice.classToObf) === ref.desc,
        )
      : candidates.find((member) => !member.method && member.obf === ref.obf);
    if (found) members.set(intermediary, found.name);
  }

  return replaceIntermediary(text, classes, simpleClasses, members);
}

function pickMethod(candidates: ProguardMember[], line: number | null): string | null {
  const unique = (list: ProguardMember[]) => [...new Set(list.map((item) => item.name))];
  if (line !== null) {
    const hits = unique(
      candidates.filter((candidate) => candidate.start <= line && line <= candidate.end),
    );
    if (hits.length > 0) return hits.join("/");
  }
  const names = unique(candidates);
  return names.length === 1 ? names[0] : null;
}

export function deobfuscateOfficial(text: string, proguard: string): string {
  const owners = new Set<string>();
  for (const match of text.matchAll(FRAME)) owners.add(match[2]);
  if (owners.size === 0) return text;

  const slice = readProguard(proguard, owners);

  return text.replace(
    FRAME,
    (match, prefix: string, owner: string, method: string, source: string) => {
      const named = slice.classFromObf.get(owner);
      if (!named || named === owner) return match;

      const lineMatch = source.match(/:(\d+)$/);
      const line = lineMatch ? Number(lineMatch[1]) : null;
      const candidates = (slice.members.get(owner) ?? []).filter(
        (member) => member.method && member.obf === method && member.name !== member.obf,
      );
      const methodName = pickMethod(candidates, line) ?? method;
      const file = source.startsWith("SourceFile")
        ? `${outerSimpleName(named)}.java${source.slice("SourceFile".length)}`
        : source;

      return `${prefix}${named}.${methodName}(${file})`;
    },
  );
}
