export type NotificationClickAction =
  | {
      type: "friend_message";
      friendId: string;
    }
  | {
      type: "game_invite";
      inviteId: string;
    };
