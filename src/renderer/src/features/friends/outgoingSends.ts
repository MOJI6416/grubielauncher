import type { IMessage } from "@/types/IMessage";

export const OUTGOING_TTL_MS = 60_000;

interface OutgoingSend {
  key: string;
  recipient: string;
  at: number;
}

let sends: OutgoingSend[] = [];
let resolved = new Map<string, OutgoingSend>();

function bodyKey(body: IMessage["message"]): string {
  return `${body?._type}|${body?.value}`;
}

function prune(now: number): void {
  sends = sends.filter((send) => now - send.at < OUTGOING_TTL_MS);

  for (const [id, send] of resolved) {
    if (now - send.at >= OUTGOING_TTL_MS) resolved.delete(id);
  }
}

export function rememberOutgoing(
  recipient: string,
  body: IMessage["message"],
  now: number = Date.now(),
): void {
  if (!recipient || !body) return;

  prune(now);
  sends.push({ key: bodyKey(body), recipient, at: now });
}

export function outgoingRecipient(
  body: IMessage["message"],
  messageId?: string,
  now: number = Date.now(),
): string | null {
  if (!body) return null;

  prune(now);

  if (messageId) {
    const known = resolved.get(messageId);
    if (known) return known.recipient;
  }

  const key = bodyKey(body);
  const index = sends.findIndex((send) => send.key === key);
  if (index === -1) return null;

  const send = sends[index];
  if (messageId) {
    sends.splice(index, 1);
    resolved.set(messageId, send);
  }

  return send.recipient;
}

export function clearOutgoing(): void {
  sends = [];
  resolved = new Map();
}
