import { Version } from "@renderer/classes/Version";
import type { ILocalAccount } from "@/types/Account";

export interface RunGameParams {
  skipUpdate?: boolean;
  skipMemoryCheck?: boolean;
  account?: ILocalAccount;
  version?: Version;
  instance?: number;
  quick?: {
    single?: string;
    multiplayer?: string;
  };
}

export interface JoinFriendWorldParams {
  versionCode: string;
  hostNickname: string;
  slug?: string;
  address?: string;
}
