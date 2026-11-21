import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Arch, build, Platform } from "electron-builder";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const unpacked = path.join(root, "dist", "win-unpacked");
const staged = path.join(root, "dist", "win-portable");

const README = `Grubie Launcher — portable

RU: Эта папка включает portable-режим. Настройки, аккаунты, сборки, Java и временные файлы лаунчера хранятся здесь, а не в AppData, и в реестр ничего не записывается. Переносите папку лаунчера целиком (вместе с data) — например, на флешку. Если удалить папку data, лаунчер запустится как обычный и будет хранить данные в AppData.

EN: This folder turns on the portable mode. The launcher keeps its settings, accounts, instances, Java and temporary files here instead of AppData and writes nothing to the registry. Move the launcher folder as a whole (together with data), for example to a USB stick. Without the data folder the launcher starts as a regular copy and stores its data in AppData.
`;

function publishMode() {
  const index = process.argv.indexOf("--publish");
  if (index === -1) return "never";
  return process.argv[index + 1] ?? "always";
}

async function main() {
  const stat = await fs.stat(unpacked).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`${unpacked} is missing: run "npm run build:win" first`);
  }

  await fs.rm(staged, { recursive: true, force: true });
  await fs.cp(unpacked, staged, { recursive: true });
  await fs.mkdir(path.join(staged, "data"), { recursive: true });
  await fs.writeFile(path.join(staged, "data", "README.txt"), README.replace(/\n/g, "\r\n"));

  const artifacts = await build({
    projectDir: root,
    targets: Platform.WINDOWS.createTarget(["zip"], Arch.x64),
    prepackaged: staged,
    publish: publishMode(),
    config: {
      win: { artifactName: "${name}-${version}-portable.${ext}" },
    },
  });

  await fs.rm(staged, { recursive: true, force: true });
  for (const artifact of artifacts) console.log(artifact);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
