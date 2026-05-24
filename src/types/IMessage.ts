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
  sender: string;
  time: Date;
}
