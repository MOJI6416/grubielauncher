import { ILocalAccount } from "@/types/Account";
import { IVersionConf } from "@/types/IVersion";

export function isOwner(owner?: string, account?: ILocalAccount) {
  if (!owner || !account) return false;

  return `${account.type}_${account.nickname}` === owner;
}

export function parseVersionOwner(owner?: string) {
  if (!owner) return null;

  const separatorIndex = owner.indexOf("_");
  if (separatorIndex <= 0 || separatorIndex === owner.length - 1) {
    return {
      type: undefined,
      nickname: owner,
    };
  }

  return {
    type: owner.slice(0, separatorIndex),
    nickname: owner.slice(separatorIndex + 1),
  };
}

export const forbiddenSymbols: string[] = [
  "\\",
  "/",
  ":",
  "*",
  "?",
  '"',
  "<",
  ">",
  "|",
];

export function checkVersionName(
  versionName: string,
  versions: IVersionConf[],
  selectedVersion?: IVersionConf,
  isDownloaded?: boolean,
) {
  const name = versionName.trim();

  if (name == "" && selectedVersion) return false;

  if (name.length > 32) return false;

  if (
    !!versions.find(
      (v) => v.name.toLocaleLowerCase() == name.toLocaleLowerCase(),
    ) &&
    (selectedVersion
      ? name != selectedVersion?.name || (!selectedVersion && isDownloaded)
      : true)
  )
    return false;

  for (let index = 0; index < forbiddenSymbols.length; index++) {
    const s = forbiddenSymbols[index];
    if (name.trim().includes(s)) return false;
  }

  return true;
}

export function supportsQuickPlayMultiplayer(versionId: string): boolean {
  const match = versionId.trim().match(/^(\d+)\.(\d+)/);
  if (!match) return false;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 1 || (major === 1 && minor >= 20);
}
