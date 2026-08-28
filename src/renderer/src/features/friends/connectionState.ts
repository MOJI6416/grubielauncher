import type { Socket } from "socket.io-client";

export type ConnectionSource = Pick<Socket, "on" | "off" | "connected">;

export type PeopleLinkState = "online" | "connecting" | "signedOut";

export function peopleLinkState(input: {
  hasSocket: boolean;
  isConnected: boolean;
}): PeopleLinkState {
  if (!input.hasSocket) return "signedOut";
  return input.isConnected ? "online" : "connecting";
}

export function bindConnectionState(
  socket: ConnectionSource,
  onChange: (connected: boolean) => void,
): () => void {
  const handleConnect = () => onChange(true);
  const handleLost = () => onChange(false);

  socket.on("connect", handleConnect);
  socket.on("disconnect", handleLost);
  socket.on("connect_error", handleLost);

  onChange(socket.connected === true);

  return () => {
    socket.off("connect", handleConnect);
    socket.off("disconnect", handleLost);
    socket.off("connect_error", handleLost);
  };
}
