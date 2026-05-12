import { IUser } from "./IUser";
import { ShareVisibility } from "./Share";

export type GameInviteTarget =
  | {
      type: "server";
      address: string;
    }
  | {
      type: "world";
      slug: string;
      sessionId: string;
      publicAddress: string;
      visibility?: ShareVisibility;
    };

export interface GameInvite {
  inviteId: string;
  sender: IUser;
  versionName: string;
  versionCode: string;
  target: GameInviteTarget;
  createdAt: string;
}

export interface GameInviteResult {
  ok: boolean;
  code?: string;
  recipientId?: string;
  inviteId?: string;
}
