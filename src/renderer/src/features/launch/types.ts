import { Version } from "@renderer/classes/Version";

export interface RunGameParams {
  skipUpdate?: boolean;
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
