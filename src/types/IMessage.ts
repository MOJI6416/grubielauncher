export interface IMessageReaction {
  emoji: string;
  users: string[];
}

export type MessageBodyType =
  | "text"
  | "modpack"
  | "image"
  | "groupInvite"
  | "system";

export interface ISystemMessagePayload {
  kind: "joined" | "left" | "kicked" | "banned" | "owner";
  nickname: string;
}

export function parseSystemMessage(
  value: string,
): ISystemMessagePayload | null {
  try {
    const parsed = JSON.parse(value);
    if (
      (parsed?.kind === "joined" ||
        parsed?.kind === "left" ||
        parsed?.kind === "kicked" ||
        parsed?.kind === "banned" ||
        parsed?.kind === "owner") &&
      typeof parsed?.nickname === "string"
    ) {
      return { kind: parsed.kind, nickname: parsed.nickname };
    }
  } catch {
    return null;
  }
  return null;
}

export interface IMessage {
  id?: string;
  // The sender's own key for one send, echoed back by the server. It is what
  // lets an answer be matched to the exact bubble it belongs to, instead of to
  // the first pending one carrying the same text.
  clientMessageId?: string;
  message: {
    _type: MessageBodyType;
    value: string;
  };
  replyTo?: {
    id: string;
    sender?: string;
    type: MessageBodyType;
    value: string;
  };
  reactions?: IMessageReaction[];
  sender: string;
  seq?: number;
  time: Date;
}

export interface IGroupInviteMessagePayload {
  code: string;
  name: string;
}

export function parseGroupInviteMessage(
  value: string,
): IGroupInviteMessagePayload | null {
  try {
    const parsed = JSON.parse(value);
    if (
      typeof parsed?.code === "string" &&
      parsed.code.length > 0 &&
      typeof parsed?.name === "string"
    ) {
      return { code: parsed.code, name: parsed.name };
    }
  } catch {
    return null;
  }
  return null;
}
