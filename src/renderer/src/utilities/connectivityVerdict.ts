import { ConnectivityCheckResult } from "@/types/Connectivity";
import { DownloadSource } from "@/types/Settings";

const CORE_MOJANG_IDS = [
  "mojang_piston",
  "mojang_libraries",
  "mojang_resources",
];

export interface DownloadVerdict {
  officialOk: boolean;
  mirrorOk: boolean;
  downloadsOk: boolean;
  messageKey:
    | "ok"
    | "okMirror"
    | "viaMirror"
    | "officialDown"
    | "mirrorDown"
    | "fail";
}

export function getDownloadVerdict(
  results: ConnectivityCheckResult[],
  source: DownloadSource,
): DownloadVerdict {
  const core = results.filter((r) => CORE_MOJANG_IDS.includes(r.id));
  const mirror = results.filter((r) => r.group === "mirror");

  const officialOk = core.length > 0 && core.every((r) => r.ok);
  const mirrorOk = mirror.length > 0 && mirror.every((r) => r.ok);

  if (source === "official") {
    return {
      officialOk,
      mirrorOk,
      downloadsOk: officialOk,
      messageKey: officialOk ? "ok" : "officialDown",
    };
  }

  if (source === "mirror") {
    return {
      officialOk,
      mirrorOk,
      downloadsOk: mirrorOk,
      messageKey: mirrorOk ? "okMirror" : "mirrorDown",
    };
  }

  if (officialOk) {
    return { officialOk, mirrorOk, downloadsOk: true, messageKey: "ok" };
  }
  if (mirrorOk) {
    return { officialOk, mirrorOk, downloadsOk: true, messageKey: "viaMirror" };
  }
  return { officialOk, mirrorOk, downloadsOk: false, messageKey: "fail" };
}
