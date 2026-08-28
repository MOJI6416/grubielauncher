import {
  RunArgumentKind,
  classifyRunArguments,
} from "@/shared/runArguments";
import { IArguments } from "@/types/IArguments";
import {
  ArgKind,
  parseArgs,
  serializeArgs,
} from "@renderer/utilities/jvmArguments";

export function readArguments(value?: IArguments): IArguments {
  return { jvm: value?.jvm ?? "", game: value?.game ?? "" };
}

export function withArgumentText(
  args: IArguments,
  kind: ArgKind,
  text: string,
): IArguments {
  return kind === "jvm" ? { ...args, jvm: text } : { ...args, game: text };
}

export function withArgumentTokens(
  args: IArguments,
  kind: ArgKind,
  tokens: string[],
): IArguments {
  return withArgumentText(args, kind, serializeArgs(tokens));
}

export function moveArgument(
  args: IArguments,
  from: ArgKind,
  index: number,
): IArguments {
  const source = parseArgs(from === "jvm" ? args.jvm : args.game);
  const token = source[index];
  if (token === undefined) return args;

  const target = parseArgs(from === "jvm" ? args.game : args.jvm);
  const kept = source.filter((_, current) => current !== index);

  return withArgumentTokens(
    withArgumentTokens(args, from, kept),
    from === "jvm" ? "game" : "jvm",
    [...target, token],
  );
}

export function hasArgumentChanges(
  current: IArguments,
  base?: IArguments,
): boolean {
  const saved = readArguments(base);
  return (
    current.jvm.trim() !== saved.jvm.trim() ||
    current.game.trim() !== saved.game.trim()
  );
}

export interface DroppedArguments {
  kind: RunArgumentKind;
  tokens: string[];
}

export function droppedArguments(
  kind: RunArgumentKind,
  tokens: string[],
): string[] {
  const allowed = classifyRunArguments(tokens, kind);
  return tokens.filter((_, index) => !allowed[index]);
}

export function summarizeDroppedArguments(
  jvmTokens: string[],
  gameTokens: string[],
): DroppedArguments[] {
  return (
    [
      { kind: "jvm" as const, tokens: droppedArguments("jvm", jvmTokens) },
      { kind: "game" as const, tokens: droppedArguments("game", gameTokens) },
    ] satisfies DroppedArguments[]
  ).filter((entry) => entry.tokens.length > 0);
}
