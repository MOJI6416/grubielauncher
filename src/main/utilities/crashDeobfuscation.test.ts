import { describe, expect, it } from "vitest";
import {
  deobfuscateIntermediary,
  deobfuscateOfficial,
  hasObfuscatedNames,
  mappingNamespace,
} from "./crashDeobfuscation";

const PROGUARD = `# fixture shaped like client_mappings
net.minecraft.client.Minecraft -> enn:
    net.minecraft.client.multiplayer.ClientLevel level -> r
    630:655:void run() -> e
    1152:1299:void runTick(boolean) -> f
    700:710:void tick() -> f
    10:10:void <init>() -> <init>
net.minecraft.client.multiplayer.ClientLevel -> fca:
    50:60:net.minecraft.world.level.block.state.BlockState getBlockState(net.minecraft.core.BlockPos) -> a_
net.minecraft.core.BlockPos -> gu:
net.minecraft.world.level.block.state.BlockState -> dcb:
net.minecraft.client.Minecraft$ChatStatus -> enn$a:
    12:14:boolean isChatAllowed(boolean):40:42 -> a
net.minecraft.client.main.Main -> net.minecraft.client.main.Main:
    20:30:void main(java.lang.String[]) -> main
`;

const TINY = [
  "v1\tofficial\tintermediary",
  "CLASS\tenn\tnet/minecraft/class_310",
  "CLASS\tenn$a\tnet/minecraft/class_310$class_5859",
  "CLASS\tfca\tnet/minecraft/class_638",
  "METHOD\tenn\t(Z)V\tf\tmethod_1523",
  "METHOD\tenn\t()V\tf\tmethod_1574",
  "METHOD\tenn\t()V\te\tmethod_1514",
  "METHOD\tfca\t(Lgu;)Ldcb;\ta_\tmethod_8320",
  "METHOD\tenn$a\t(Z)Z\ta\tmethod_33861",
  "FIELD\tenn\tLfca;\tr\tfield_1687",
  "",
].join("\n");

describe("mappingNamespace", () => {
  it("maps only the loaders that run under these names", () => {
    expect(mappingNamespace(undefined)).toBe("official");
    expect(mappingNamespace("vanilla")).toBe("official");
    expect(mappingNamespace("fabric")).toBe("intermediary");
    expect(mappingNamespace("quilt")).toBe("intermediary");
    expect(mappingNamespace("forge")).toBeNull();
    expect(mappingNamespace("neoforge")).toBeNull();
    expect(mappingNamespace("legacy-fabric")).toBeNull();
    expect(mappingNamespace("ornithe")).toBeNull();
  });
});

describe("hasObfuscatedNames", () => {
  it("looks for intermediary names or obfuscated frames only", () => {
    expect(hasObfuscatedNames("at net.minecraft.class_310.method_1514", "intermediary")).toBe(true);
    expect(hasObfuscatedNames("\tat enn.f(SourceFile:1152)", "official")).toBe(true);
    expect(
      hasObfuscatedNames(
        "\tat net.minecraft.client.Minecraft.run(Minecraft.java:630)\n\tat java.lang.Thread.run(Thread.java:840)",
        "official",
      ),
    ).toBe(false);
  });
});

describe("deobfuscateIntermediary", () => {
  it("names classes, overloads and fields exactly", () => {
    const log = [
      'java.lang.NullPointerException: Cannot invoke "net.minecraft.class_638.method_8320(net.minecraft.class_2338)" because "this.field_1687" is null',
      "\tat knot//net.minecraft.class_310.method_1523(class_310.java:1160) ~[client-intermediary.jar:?]",
      "\tat knot//net.minecraft.class_310.method_1574(class_310.java:705) ~[client-intermediary.jar:?]",
      "\tat knot//net.minecraft.class_310$class_5859.method_33861(class_310.java:13)",
      "Mixin apply failed for net/minecraft/class_310 in example.mixins.json",
    ].join("\n");

    expect(deobfuscateIntermediary(log, TINY, PROGUARD).split("\n")).toEqual([
      'java.lang.NullPointerException: Cannot invoke "net.minecraft.client.multiplayer.ClientLevel.getBlockState(net.minecraft.class_2338)" because "this.level" is null',
      "\tat knot//net.minecraft.client.Minecraft.runTick(Minecraft.java:1160) ~[client-intermediary.jar:?]",
      "\tat knot//net.minecraft.client.Minecraft.tick(Minecraft.java:705) ~[client-intermediary.jar:?]",
      "\tat knot//net.minecraft.client.Minecraft$ChatStatus.isChatAllowed(Minecraft.java:13)",
      "Mixin apply failed for net/minecraft/client/Minecraft in example.mixins.json",
    ]);
  });

  it("returns the text untouched when nothing in it is obfuscated", () => {
    const log = "\tat com.example.Mod.init(Mod.java:3)";
    expect(deobfuscateIntermediary(log, TINY, PROGUARD)).toBe(log);
  });
});

describe("deobfuscateOfficial", () => {
  it("maps frames and lets the line pick the overload", () => {
    const log = [
      "\tat enn.f(SourceFile:1160)",
      "\tat enn.f(SourceFile:705)",
      "\tat enn.e(SourceFile:640)",
      "\tat net.minecraft.client.main.Main.main(SourceFile:25)",
    ].join("\n");

    expect(deobfuscateOfficial(log, PROGUARD).split("\n")).toEqual([
      "\tat net.minecraft.client.Minecraft.runTick(Minecraft.java:1160)",
      "\tat net.minecraft.client.Minecraft.tick(Minecraft.java:705)",
      "\tat net.minecraft.client.Minecraft.run(Minecraft.java:640)",
      "\tat net.minecraft.client.main.Main.main(SourceFile:25)",
    ]);
  });

  it("keeps an overloaded name it cannot tell apart and leaves prose alone", () => {
    expect(deobfuscateOfficial("\tat enn.f(SourceFile)", PROGUARD)).toBe(
      "\tat net.minecraft.client.Minecraft.f(Minecraft.java)",
    );
    expect(deobfuscateOfficial("enn.f is not a frame", PROGUARD)).toBe("enn.f is not a frame");
  });
});
