export interface IMessageReaction {
  emoji: string;
  users: string[];
}

export interface IMessage {
  id?: string;
  message: {
    _type: "text" | "modpack" | "image";
    value: string;
  };
  replyTo?: {
    id: string;
    sender?: string;
    type: "text" | "modpack" | "image";
    value: string;
  };
  reactions?: IMessageReaction[];
  sender: string;
  time: Date;
}
